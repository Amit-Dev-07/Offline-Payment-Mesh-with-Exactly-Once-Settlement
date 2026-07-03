package com.demo.upimesh.service;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * JVM-local idempotency store. Production can swap this for Redis SET NX EX.
 */
@Service
public class InMemoryIdempotencyStore implements IdempotencyStore {

    private final Map<String, Instant> seen = new ConcurrentHashMap<>();

    @Override
    public boolean claim(String packetHash) {
        Instant previous = seen.putIfAbsent(packetHash, Instant.now());
        return previous == null;
    }

    @Override
    public int size() {
        return seen.size();
    }

    @Override
    public void evictExpired(long ttlSeconds) {
        Instant cutoff = Instant.now().minusSeconds(ttlSeconds);
        seen.entrySet().removeIf(entry -> entry.getValue().isBefore(cutoff));
    }

    @Override
    public void clear() {
        seen.clear();
    }
}
