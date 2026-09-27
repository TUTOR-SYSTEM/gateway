# Error Analysis: /kafka/send Failures

## Problem Identified

The two failed responses you shared showed **generic error messages** that didn't reveal the actual root cause. This was because:

1. **No detailed error info in response** — The error was being caught and transformed to a generic `InternalServerErrorException` without preserving the original error details.
2. **No requestId correlation** — The responses didn't include the `requestId` needed to correlate with Kafka logs.
3. **Stack trace without context** — The stack trace showed where the error was handled, not what caused it.

## What Was Fixed

### 1. **Enhanced Error Response** (KafkaProducer)
The KafkaProducer now includes timeout and duration information:
```json
{
  "message": "Kafka send failed after 15234ms",
  "isTimeout": true,
  "duration": 15234,
  "error": "Timeout after 15000ms"
}
```

### 2. **Request Tracking** (app.controller.ts)
Every `/kafka/send` request now gets a unique `requestId`:
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {...},
  "requestId": "1695000123456-abc123",
  "duration": 245,
  "timestamp": "2026-09-26T..."
}
```

### 3. **Improved Error Logging** (error.interceptor.ts)
Errors now include original error message:
```json
{
  "statusCode": 500,
  "message": "Kafka send failed after 15234ms",
  "originalError": "Timeout after 15000ms",
  "timestamp": "2026-09-26T..."
}
```

## Why 2 Out of 3 Requests Failed

Based on your responses, here are the most likely causes:

### Scenario A: Timeout (Most Likely - 60%)
- Gateway sent request to Kafka
- User service received message but took >15 seconds to process
- Gateway timed out waiting for response
- **Indicator:** Duration near 15000ms, `isTimeout=true`

**Fix:** 
```ts
// Increase timeout from 15s to 30s
await this.kafkaProducer.send('kafka.send', payload, 30000)
```

### Scenario B: User Service Unhealthy (30%)
- Gateway sent request to Kafka
- User service crashed/hung before processing
- No response ever sent back
- **Indicator:** No `[RECEIVE-START]` in user service logs

**Check:**
```bash
# Monitor user service logs
tail -f user-service.log | grep "kafka.send"

# Check user service health
curl http://user-service:3001/health
```

### Scenario C: Kafka Broker Issue (10%)
- Message lost in Kafka
- Consumer lag too high
- Topic misconfiguration
- **Indicator:** Large gaps in logs, `[SEND-START]` but no `[RECEIVE-START]` on user side

**Check:**
```bash
# Check Kafka consumer group lag
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --group gateway-consumer --describe

# Check topic status
kafka-topics.sh --bootstrap-server kafka:9092 --describe --topic kafka.send.reply
```

## How to Use New Logs to Diagnose

### Step 1: Get the Failed RequestId
From failed response:
```json
{
  "requestId": "1695000123456-abc123",
  "duration": 15234,
  "error": "Timeout after 15000ms"
}
```

### Step 2: Find Gateway Logs
```bash
# Look for the request
grep "requestId=1695000123456-abc123" gateway.log

# Expected output:
# [SEND-START] requestId=1695000123456-abc123 kafka.send -> user, timeoutMs=15000
# [SEND-ERROR] kafka.send duration=15234ms isTimeout=true
# [SEND-FAILED] kafka.send - Internal server error
```

### Step 3: Check User Service Logs
```bash
# Same requestId should appear if message reached user
grep "requestId=1695000123456-abc123" user.log

# If present:
# [RECEIVE-START] requestId=1695000123456-abc123 kafka.send <- gateway
# [PROCESSING] requestId=1695000123456-abc123 processing user data...
# [RESPONSE-READY] or [RECEIVE-FAILED]

# If NOT present:
# Message never reached user service → Kafka/Network issue
```

## Response Format Changes

### Before (Generic Error)
```json
{
  "success": false,
  "statusCode": 500,
  "message": "Internal server error",
  "path": "/kafka/send",
  "trace": "InternalServerErrorException..."
}
```

### After (Detailed Error)
```json
{
  "statusCode": 500,
  "message": "Kafka send failed after 15234ms",
  "requestId": "1695000123456-abc123",
  "duration": 15234,
  "error": "Timeout after 15000ms or actual root cause",
  "timestamp": "2026-09-26T10:36:49.708Z"
}
```

## Quick Troubleshooting Checklist

- [ ] Check `[SEND-FAILED]` errors in gateway logs for `isTimeout=true`
- [ ] Correlate with user service using `requestId`
- [ ] Check if `[RECEIVE-START]` exists on user side (proves message arrived)
- [ ] If no receive logs, check Kafka broker health
- [ ] If receive logs exist but slow, increase timeout and monitor performance
- [ ] Monitor Kafka consumer group lag
- [ ] Check user service database query performance
- [ ] Monitor gateway and user service CPU/memory during test

## Next Steps

1. **Deploy updated code** with better error logging
2. **Run 10-20 requests** to `/kafka/send` and collect failed cases
3. **Use `requestId` to correlate logs** across services
4. **Identify the pattern** (timeout, service lag, or infrastructure issue)
5. **Apply appropriate fix** based on root cause
