# Kafka Configuration Guide

## Changes Made (2026-09-26)

### SSL/TLS Disabled for Internal Connections
- **Before**: `ssl: process.env.KAFKA_SSL !== 'false'` (SSL enabled by default)
- **After**: `ssl: process.env.KAFKA_SSL === 'true'` (SSL disabled by default)

### Default Brokers Updated
- **Before**: `localhost:9092` (development)
- **After**: `kafka:9092` (Railway internal service)

### Files Modified

1. **src/features/kafka/kafka.module.ts**
   - Changed default KAFKA_BROKERS from `localhost:9092` to `kafka:9092`
   - Disabled SSL by default (`ssl: false`)
   - Added optional SASL authentication support
   - Improved connectionTimeout from 10s to 15s
   - Updated clientId to `gateway-prod-client`

2. **src/features/kafka/kafka.admin.ts**
   - Updated admin client to use same SSL/SASL config as producer
   - Uses KAFKA_BROKERS, KAFKA_SSL, and SASL env vars
   - Updated clientId pattern for consistency

## Environment Variables

### Required (defaults provided)
```env
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=gateway-prod-client
KAFKA_GROUP_ID=gateway-service
```

### Optional - For TLS/SASL (if connecting via public proxy)
```env
# TLS Configuration
KAFKA_SSL=true              # Default: false (only set to 'true' for public proxy)

# SASL Authentication
KAFKA_SASL_ENABLED=true     # Enable SASL auth (default: false)
KAFKA_SASL_MECHANISM=plain  # Options: plain, scram-sha-256, scram-sha-512 (default: plain)
KAFKA_SASL_USERNAME=user    # Your Kafka username
KAFKA_SASL_PASSWORD=pass    # Your Kafka password
```

### Timeouts (tunable)
```env
KAFKA_CONNECTION_TIMEOUT=15000    # 15 seconds (was 10s)
KAFKA_REQUEST_TIMEOUT=30000       # 30 seconds
KAFKA_SESSION_TIMEOUT=30000       # Consumer session timeout
KAFKA_REBALANCE_TIMEOUT=60000     # Rebalance timeout
KAFKA_HEARTBEAT_INTERVAL=3000     # Heartbeat interval
```

## Railway Setup

### For Internal Kafka (Recommended)
```env
KAFKA_BROKERS=kafka:9092
KAFKA_SSL=false
# No SASL needed for internal connections
```

### For Public Kafka Proxy (if needed)
```env
KAFKA_BROKERS=ballast.proxy.rlwy.net:34047
KAFKA_SSL=true
# Add SASL if Railway Kafka requires authentication
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=<your-username>
KAFKA_SASL_PASSWORD=<your-password>
```

## Troubleshooting

### Kafka Connection Refused
- Check KAFKA_BROKERS is reachable
- Verify Kafka service is running: `railway service describe Kafka`
- Check logs: `railway logs --service Kafka`

### TLS Handshake Failed
- Ensure KAFKA_SSL=false for internal connections
- Only set KAFKA_SSL=true when using public proxy

### Invalid Message Format
- This was caused by TLS data being sent to non-TLS broker
- Fixed by disabling SSL for internal connections

## Testing Connection

### Via Railway Shell
```bash
railway shell --service gateway
nc -zv kafka 9092  # Test internal connectivity
```

### Via Logs
- Check `[SEND-START]`, `[SEND-SUCCESS]` in gateway logs
- Check Kafka logs for connection errors

## Architecture

- **Gateway**: HTTP edge, uses KafkaJS ClientKafka
- **Kafka**: Message broker for inter-service RPC
- **Connection**: Internal Railway service-to-service (no TLS needed)
