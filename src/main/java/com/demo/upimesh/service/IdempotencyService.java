package com.demo.upimesh.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Facade over the idempotency store. The demo uses an in-memory store; a
 * production deployment can provide a Redis-backed IdempotencyStore with the
 * same claim/TTL semantics.
 */
@Service
public class IdempotencyService {

    private final IdempotencyStore store;

    @Value("${upi.mesh.idempotency-ttl-seconds:86400}")
    private long ttlSeconds;

    public IdempotencyService(IdempotencyStore store) {
        this.store = store;
    }

    public boolean claim(String packetHash) {
        return store.claim(packetHash);
    }

    public int size() {
        return store.size();
    }

    @Scheduled(fixedDelay = 60_000)
    public void evictExpired() {
        store.evictExpired(ttlSeconds);
    }

    public void clear() {
        store.clear();
    }
}
