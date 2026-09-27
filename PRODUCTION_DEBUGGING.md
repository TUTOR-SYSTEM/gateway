# Production Debugging Guide: /kafka/send Timeout Issues

## Overview
Enhanced logging has been added to both gateway and user service to help diagnose why 2 out of 3 requests to `/kafka/send` are timing out or failing.

## Log Format & What to Look For

### Gateway-side Logs
The gateway logs follow this pattern for `/kafka/send` requests:

```
[SEND-START] requestId={id} kafka.send -> user, duration={ms}ms
[SEND-SUCCESS] requestId={id} kafka.send <- user, duration={duration}ms
[SEND-FAILED] requestId={id} kafka.send -> user, duration={duration}ms, error={message}
```

**Key fields:**
- `requestId` — unique identifier to correlate gateway and user service logs
- `duration` — total time from request start to response/error
- `isTimeout` — whether the error was a timeout (15000ms limit)
- `error` — detailed error message

### User Service Logs
The user service logs follow this pattern:

```
[RECEIVE-START] requestId={id} kafka.send <- gateway, payload={data}
[PROCESSING] requestId={id} processing user data...
[RESPONSE-READY] requestId={id} kafka.send -> gateway, duration={ms}ms
[RECEIVE-FAILED] requestId={id} kafka.send processing error, duration={duration}ms, error={message}
```

## Diagnosis Steps

### 1. Find Failed Requests
Search your logs for `[SEND-FAILED]` in the gateway logs:
```bash
# Get all failed requests
grep "\[SEND-FAILED\]" gateway-logs.log

# Get all timeout-specific failures
grep "\[SEND-ERROR\].*isTimeout=true" gateway-logs.log
```

### 2. Correlate Gateway ↔ User Service
Use the `requestId` to find corresponding logs in the user service:

**For a gateway request:**
```
[SEND-START] requestId=1695000123456-abc123 kafka.send -> user
```

**Search user service logs for the same requestId:**
```bash
grep "requestId=1695000123456-abc123" user-logs.log
```

### 3. Identify Root Causes

#### Case 1: Gateway logs SUCCESS but no User logs
- **Problem:** Request never reached user service (network/Kafka issue)
- **Action:** Check Kafka broker connectivity, topic subscriptions
- **Look for:** `[SEND-SUCCESS]` with large duration on gateway but no corresponding `[RECEIVE-START]` on user

#### Case 2: User logs RECEIVE but no RESPONSE
- **Problem:** User service hung/crashed during processing
- **Action:** Check user service CPU, memory, database connections
- **Look for:** `[RECEIVE-START]` but no `[RESPONSE-READY]` or `[RECEIVE-FAILED]`

#### Case 3: User RESPONSE but Gateway timeout
- **Problem:** Response took >15 seconds (timeout limit)
- **Action:** Check user service processing time, network latency
- **Look for:** `[RESPONSE-READY] duration=14500ms` but `[SEND-ERROR] isTimeout=true` on gateway

#### Case 4: User throws error
- **Problem:** User service application error
- **Action:** Check user service error logs, database errors
- **Look for:** `[RECEIVE-FAILED]` with error stack on user service

## Log Aggregation Example

### CloudWatch / ELK / Splunk Query
Correlate gateway and user logs:

```
# Find all failed /kafka/send requests in last 1 hour
source=gateway OR source=user
| search "[SEND-FAILED] OR [RECEIVE-FAILED]"
| stats by requestId
| lookup other source

# Show timeline of a specific request
source=gateway OR source=user requestId=1695000123456-abc123
| timechart by source
```

### Docker Compose / Local Testing
```bash
# Terminal 1: Watch gateway logs
docker logs -f gateway_container | grep "SEND"

# Terminal 2: Watch user service logs
docker logs -f user_service_container | grep "RECEIVE\|RESPONSE"

# Terminal 3: Send test request
curl http://localhost:8888/kafka/send
```

## Metrics to Monitor

1. **Request Duration** (from `duration=` field)
   - Normal: 0-500ms
   - Slow: 500-5000ms
   - Critical: >10000ms

2. **Timeout Rate**
   - Track `isTimeout=true` occurrences
   - If >50%, check user service health or increase timeout from 15000ms

3. **Processing Time**
   - Compare user service `[RESPONSE-READY] duration=` with total gateway `[SEND-SUCCESS] duration=`
   - If user processing time <<< total duration, issue is network/Kafka latency

## Response Format Changes

### Success Response
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { ... },
  "requestId": "1695000123456-abc123",
  "duration": 245,
  "timestamp": "2026-09-26T..."
}
```

### Error Response
```json
{
  "statusCode": 500,
  "message": "Kafka send failed after 15234ms",
  "requestId": "1695000123456-abc123",
  "duration": 15234,
  "error": "Timeout after 15000ms",
  "timestamp": "2026-09-26T..."
}
```

## Next Steps if Issues Persist

1. **Increase timeout** if user service needs more time:
   ```ts
   // In gateway app.controller.ts, change from 15000 to 30000ms
   await this.kafkaProducer.send('kafka.send', payload, 30000)
   ```

2. **Add metrics collection:**
   - Track request count, success rate, duration percentiles
   - Set alerts for timeout rate >10%

3. **Check Kafka health:**
   - Broker CPU/memory/disk
   - Replication lag
   - Consumer group lag

4. **Check user service health:**
   - Database connection pool exhaustion
   - Unhandled promise rejections
   - Memory leaks

## Log Output Examples

### Good Request
```
[Gateway]
[SEND-START] requestId=1695000123456-abc123 kafka.send -> user, timeoutMs=15000
[SEND-SUCCESS] requestId=1695000123456-abc123 kafka.send <- user, duration=245ms

[User Service]
[RECEIVE-START] requestId=1695000123456-abc123 kafka.send <- gateway, payload={...}
[PROCESSING] requestId=1695000123456-abc123 processing user data...
[RESPONSE-READY] requestId=1695000123456-abc123 kafka.send -> gateway, duration=120ms
```

### Bad Request (Timeout)
```
[Gateway]
[SEND-START] requestId=1695000123457-def456 kafka.send -> user, timeoutMs=15000
[SEND-ERROR] kafka.send duration=15234ms isTimeout=true error="Timeout after 15000ms"
[SEND-FAILED] kafka.send - Internal server error

[User Service]
[RECEIVE-START] requestId=1695000123457-def456 kafka.send <- gateway, payload={...}
[PROCESSING] requestId=1695000123457-def456 processing user data...
(no response within 15s - gateway times out)
```
