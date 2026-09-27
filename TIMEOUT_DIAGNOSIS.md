# Timeout Diagnosis: Request Failed at 15-Second Limit

## Error Details
```json
{
  "message": "Timeout has occurred",
  "statusCode": 500,
  "correlationId": "7758940f-0f27-4d7c-8c69-5f4a0c166868",
  "path": "/kafka/send",
  "timestamp": "2026-09-26T10:42:44.962Z"
}
```

## What This Means
The gateway waited **15 seconds** for a response from the user service via Kafka, then gave up:
- ✅ Request successfully sent to Kafka
- ❌ No response received within 15000ms timeout window
- ❌ User service either didn't process or took too long

## Immediate Diagnosis Steps

### Step 1: Check User Service Logs
Search user service logs for the **correlationId** to see if the message arrived:

```bash
grep "7758940f-0f27-4d7c-8c69-5f4a0c166868" user-service.log
```

#### If logs appear:
```
[RECEIVE-START] correlationId=7758940f-0f27-4d7c-8c69-5f4a0c166868 kafka.send <- gateway
[PROCESSING] correlationId=7758940f-0f27-4d7c-8c69-5f4a0c166868 processing user data...
[RESPONSE-READY] correlationId=7758940f-0f27-4d7c-8c69-5f4a0c166868 duration=12450ms
```

**Diagnosis:** ✅ Message arrived, processing took 12.4 seconds → **Need to increase timeout**

#### If logs DON'T appear:
**Diagnosis:** ❌ Message never reached user service → **Kafka/network issue**

---

## Root Cause Analysis

### Scenario 1: User Service Processing is Slow (Most Likely)
**Symptoms:**
- `[RECEIVE-START]` appears in user logs
- `[RESPONSE-READY]` shows duration > 13000ms
- Consistently hitting 15s timeout

**Why:** Database query, complex business logic, or external API calls taking too long

**Solutions:**
```ts
// Option A: Increase timeout (short-term fix)
// In app.controller.ts sendMsgFromKafkaController:
await this.kafkaProducer.send('kafka.send', payload, 30000)  // 30 seconds

// Option B: Optimize user service (long-term fix)
// Profile the processing in user service
// Check database query performance
// Add caching for repeated operations
```

---

### Scenario 2: Message Never Arrived at User Service
**Symptoms:**
- No `[RECEIVE-START]` in user service logs
- Gateway shows timeout at exactly 15000ms

**Why:** 
- Kafka broker issue
- Topic not created
- Consumer not subscribed
- Network partition

**Check Kafka Health:**
```bash
# Check if kafka.send.reply topic exists
kafka-topics.sh --bootstrap-server kafka:9092 --list | grep kafka.send

# Expected topics:
# kafka.send          (request topic)
# kafka.send.reply    (reply topic)

# Check consumer group status
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --group gateway-consumer --describe

# Expected: should show lag of 0 if processing normally
```

---

### Scenario 3: User Service Crashed/Hung
**Symptoms:**
- `[RECEIVE-START]` appears
- `[PROCESSING]` appears
- But no `[RESPONSE-READY]` within 15 seconds

**Why:**
- Unhandled exception in handler
- Database connection timeout
- Memory leak causing slowdown
- Deadlock in processing

**Troubleshooting:**
```bash
# Check user service health endpoint
curl http://user-service:3001/health

# Check recent error logs
tail -100 user-service.log | grep ERROR

# Check process memory/CPU
docker stats user-service-container

# Check database connections
SELECT count(*) FROM pg_stat_activity;  -- PostgreSQL
```

---

## Step-by-Step Diagnostic Workflow

### 1️⃣ Reproduce the Issue
```bash
# Make multiple requests to /kafka/send
for i in {1..3}; do
  curl http://gateway:8888/kafka/send
  sleep 2
done
```

### 2️⃣ Collect CorrelationIds
From failed responses, note the `correlationId` values.

### 3️⃣ Check Gateway Logs
```bash
# Look for all SEND operations
grep "\[SEND-" gateway.log | grep "correlationId=7758940f"

# Expected output:
# [SEND-START] ... correlationId=7758940f...
# [SEND-ERROR] ... duration=15234ms isTimeout=true
```

### 4️⃣ Check User Service Logs
```bash
# Search for SAME correlationId on user side
grep "7758940f" user.log

# If found: message arrived → check processing duration
# If NOT found: message lost in Kafka → check broker health
```

### 5️⃣ Identify Pattern
From 3 timeout requests, check:
- Did all 3 show slow processing? → **User service is slow**
- Did some show no receive logs? → **Kafka issue (intermittent)**
- Did user hang on one but not others? → **Resource exhaustion**

---

## Current Status

**Gateway:** ✅ Working, timeout correctly triggered after 15 seconds  
**User Service:** 🤔 Unknown — need to check logs with correlationId  
**Kafka:** 🤔 Unknown — need to verify message delivery  

---

## Recommended Actions (Priority Order)

### 🔴 High Priority
1. **Search user logs for correlationId** `7758940f-0f27-4d7c-8c69-5f4a0c166868`
   - If found: Check `[RESPONSE-READY]` duration
   - If NOT found: Check Kafka broker health

2. **Run 5 more requests** and collect all correlationIds
   - See if ALL timeout (consistent slow processing) or SOME (intermittent issues)

### 🟡 Medium Priority
3. **If user service IS slow:**
   ```ts
   // Temporarily increase timeout to allow processing
   await this.kafkaProducer.send('kafka.send', payload, 30000)
   
   // Then profile and optimize user service
   ```

4. **If Kafka issue:**
   - Restart Kafka broker
   - Verify consumer group subscriptions
   - Check topic replication status

### 🟢 Low Priority
5. **Add metrics collection** to track:
   - Request count per minute
   - Timeout rate
   - Average processing duration
   - P99 duration (99th percentile)

---

## Expected vs Actual Behavior

### Expected (Sub-second Processing)
```
Gateway:     [SEND-START] ──→ [SEND-SUCCESS] duration=150ms
User:        [RECEIVE-START] → [PROCESSING] → [RESPONSE-READY] duration=100ms
Timeline:    0ms ──────────── 100ms ──────────── 150ms
```

### Actual (Timeout)
```
Gateway:     [SEND-START] ──────────────────────→ [SEND-ERROR] timeout after 15s
User:        [RECEIVE-START] → [PROCESSING] ───→ (TIMEOUT, response never sent)
Timeline:    0ms ─────── 100ms ──────── 12000ms ──────── 15000ms (TIMEOUT)
```

---

## Next Steps

**Before proceeding, answer these questions:**

1. ❓ Check user service logs for correlationId `7758940f-0f27-4d7c-8c69-5f4a0c166868`
   - [ ] Logs found → What is the `[RESPONSE-READY] duration=?` value?
   - [ ] No logs → Check Kafka broker health

2. ❓ Is this timeout consistent (happens every time) or intermittent?
   - [ ] Consistent → User service processing is slow
   - [ ] Intermittent → Resource exhaustion or network issue

3. ❓ What is user service CPU/Memory usage during timeout?
   - [ ] High → Optimize code or increase resources
   - [ ] Normal → Check database or external API latency

**Report findings and I'll help optimize!**
