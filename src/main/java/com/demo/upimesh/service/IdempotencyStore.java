package com.demo.upimesh.service;

public interface IdempotencyStore {
    boolean claim(String packetHash);
    int size();
    void evictExpired(long ttlSeconds);
    void clear();
}
