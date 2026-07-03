package com.demo.upimesh.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Service
public class BridgeAuthService {

    @Value("${upi.mesh.bridge-api-key:demo-bridge-secret}")
    private String expectedApiKey;

    public boolean isAuthorized(String providedApiKey) {
        if (providedApiKey == null || providedApiKey.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                providedApiKey.getBytes(StandardCharsets.UTF_8),
                expectedApiKey.getBytes(StandardCharsets.UTF_8));
    }
}
