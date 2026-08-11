package com.demo.upimesh.controller;

import com.demo.upimesh.crypto.ServerKeyHolder;
import com.demo.upimesh.model.Account;
import com.demo.upimesh.model.AccountRepository;
import com.demo.upimesh.model.MeshPacket;
import com.demo.upimesh.model.Transaction;
import com.demo.upimesh.model.TransactionRepository;
import com.demo.upimesh.service.BridgeAuthService;
import com.demo.upimesh.service.BridgeIngestionService;
import com.demo.upimesh.service.DemoService;
import com.demo.upimesh.service.IdempotencyService;
import com.demo.upimesh.service.MeshSimulatorService;
import com.demo.upimesh.service.VirtualDevice;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ApiController {

    @Autowired private ServerKeyHolder serverKey;
    @Autowired private DemoService demo;
    @Autowired private MeshSimulatorService mesh;
    @Autowired private BridgeIngestionService bridge;
    @Autowired private BridgeAuthService bridgeAuth;
    @Autowired private AccountRepository accountRepo;
    @Autowired private TransactionRepository txRepo;
    @Autowired private IdempotencyService idempotency;

    @GetMapping("/server-key")
    public Map<String, String> getServerPublicKey() {
        return Map.of(
                "publicKey", serverKey.getPublicKeyBase64(),
                "algorithm", "RSA-2048 / OAEP-SHA256",
                "hybridScheme", "RSA-OAEP encrypts an AES-256-GCM session key"
        );
    }

    @PostMapping("/demo/send")
    public ResponseEntity<?> demoSend(@Valid @RequestBody DemoSendRequest req) throws Exception {
        validatePaymentRequest(req);

        MeshPacket packet = demo.createPacket(
                req.senderVpa, req.receiverVpa, req.amount, req.pin,
                req.ttl == null ? 5 : req.ttl);

        String startDevice = req.startDevice == null || req.startDevice.isBlank()
                ? "phone-amit"
                : req.startDevice;
        mesh.inject(startDevice, packet);

        return ResponseEntity.ok(Map.of(
                "packetId", packet.getPacketId(),
                "ciphertextPreview", packet.getCiphertext().substring(0, 64) + "...",
                "ttl", packet.getTtl(),
                "injectedAt", startDevice
        ));
    }

    @GetMapping("/mesh/state")
    public Map<String, Object> meshState() {
        List<Map<String, Object>> deviceData = mesh.getDevices().stream()
                .sorted(Comparator.comparing(VirtualDevice::hasInternet).thenComparing(VirtualDevice::getDeviceId))
                .map(this::devicePayload)
                .toList();

        return Map.of(
                "devices", deviceData,
                "idempotencyCacheSize", idempotency.size(),
                "bridgeCount", mesh.bridgeCount()
        );
    }

    @PostMapping("/mesh/gossip")
    public Map<String, Object> meshGossip() {
        MeshSimulatorService.GossipResult r = mesh.gossipOnce();
        return gossipPayload(1, r);
    }

    @PostMapping("/mesh/gossip-rounds")
    public Map<String, Object> meshGossipRounds(@Valid @RequestBody GossipRoundsRequest req) {
        MeshSimulatorService.GossipResult r = mesh.gossipRounds(req.rounds);
        return gossipPayload(req.rounds, r);
    }

    @PostMapping("/mesh/devices")
    public Map<String, Object> addMeshDevice(@Valid @RequestBody AddMeshDeviceRequest req) {
        VirtualDevice device = mesh.addDevice(req.hasInternet);
        return Map.of(
                "status", req.hasInternet ? "bridge node added" : "offline node added",
                "device", devicePayload(device),
                "bridgeCount", mesh.bridgeCount()
        );
    }

    @DeleteMapping("/mesh/devices")
    public Map<String, Object> removeMeshDevice(@Valid @RequestBody RemoveMeshDeviceRequest req) {
        VirtualDevice device = mesh.removeDevice(req.hasInternet);
        return Map.of(
                "status", req.hasInternet ? "bridge node removed" : "offline node removed",
                "device", devicePayload(device),
                "bridgeCount", mesh.bridgeCount()
        );
    }

    @PostMapping("/mesh/duplicate-storm")
    public Map<String, Object> duplicateStorm(@Valid @RequestBody DemoSendRequest req) throws Exception {
        req.startDevice = "phone-amit";
        validatePaymentRequest(req);
        mesh.seedDuplicateStormTopology();
        idempotency.clear();

        MeshPacket packet = demo.createPacket(
                req.senderVpa, req.receiverVpa, req.amount, req.pin,
                req.ttl == null ? 5 : req.ttl);
        mesh.inject("phone-amit", packet);

        MeshSimulatorService.GossipResult gossipResult = mesh.gossipRounds(2);
        FlushSummary flush = flushBridgeUploads();

        return Map.of(
                "packetId", packet.getPacketId(),
                "injectedAt", "phone-amit",
                "rounds", 2,
                "gossipTransfers", gossipResult.transfers(),
                "bridgeCount", mesh.bridgeCount(),
                "uploadsAttempted", flush.uploadsAttempted(),
                "results", flush.results()
        );
    }

    @PostMapping("/mesh/flush")
    public Map<String, Object> meshFlush() {
        FlushSummary flush = flushBridgeUploads();
        return Map.of(
                "uploadsAttempted", flush.uploadsAttempted(),
                "results", flush.results()
        );
    }

    @PostMapping("/mesh/reset")
    public Map<String, Object> meshReset() {
        mesh.resetMesh();
        idempotency.clear();
        return Map.of("status", "mesh packets and idempotency cache cleared");
    }

    @PostMapping("/bridge/ingest")
    public ResponseEntity<?> ingest(
            @Valid @RequestBody MeshPacket packet,
            @RequestHeader(value = "X-Bridge-Node-Id", defaultValue = "unknown") String bridgeNodeId,
            @RequestHeader(value = "X-Hop-Count", defaultValue = "0") int hopCount,
            @RequestHeader(value = "X-Bridge-Api-Key", required = false) String apiKey) {

        if (!bridgeAuth.isAuthorized(apiKey)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "error", "bridge_unauthorized",
                    "message", "Missing or invalid X-Bridge-Api-Key"
            ));
        }

        BridgeIngestionService.IngestResult r = bridge.ingest(packet, bridgeNodeId, hopCount);
        return ResponseEntity.ok(r);
    }

    @GetMapping("/accounts")
    public List<Account> listAccounts() {
        return accountRepo.findAll();
    }

    @GetMapping("/transactions")
    public List<Transaction> listTransactions() {
        return txRepo.findTop20ByOrderByIdDesc();
    }

    private void validatePaymentRequest(DemoSendRequest req) {
        if (req.senderVpa.equals(req.receiverVpa)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sender and receiver must be different");
        }
        if (!accountRepo.existsById(req.senderVpa)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown sender VPA: " + req.senderVpa);
        }
        if (!accountRepo.existsById(req.receiverVpa)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown receiver VPA: " + req.receiverVpa);
        }

        String startDevice = req.startDevice == null || req.startDevice.isBlank()
                ? "phone-amit"
                : req.startDevice;
        if (mesh.getDevice(startDevice) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown start device: " + startDevice);
        }

        Account sender = accountRepo.findById(req.senderVpa).orElseThrow();
        if (sender.getBalance().compareTo(req.amount) < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Insufficient balance: " + req.senderVpa + " has Rs. "
                            + sender.getBalance() + ", but the send amount is Rs. " + req.amount
            );
        }
    }

    private FlushSummary flushBridgeUploads() {
        List<MeshSimulatorService.BridgeUpload> uploads = mesh.collectBridgeUploads();

        List<Map<String, Object>> results = new ArrayList<>();
        uploads.parallelStream().forEach(up -> {
            BridgeIngestionService.IngestResult r =
                    bridge.ingest(up.packet(), up.bridgeNodeId(), 5 - up.packet().getTtl());
            synchronized (results) {
                results.add(Map.of(
                        "bridgeNode", up.bridgeNodeId(),
                        "packetId", up.packet().getPacketId().substring(0, 8),
                        "outcome", r.outcome(),
                        "reason", r.reason() == null ? "" : r.reason(),
                        "transactionId", r.transactionId() == null ? -1 : r.transactionId()
                ));
            }
        });

        return new FlushSummary(uploads.size(), results);
    }

    private Map<String, Object> devicePayload(VirtualDevice device) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("deviceId", device.getDeviceId());
        data.put("hasInternet", device.hasInternet());
        data.put("packetCount", device.packetCount());
        data.put("packetIds", device.getHeldPackets().stream()
                .map(p -> p.getPacketId().substring(0, 8))
                .toList());
        return data;
    }

    private Map<String, Object> gossipPayload(int rounds, MeshSimulatorService.GossipResult r) {
        return Map.of(
                "rounds", rounds,
                "transfers", r.transfers(),
                "deviceCounts", r.deviceCounts()
        );
    }

    private record FlushSummary(int uploadsAttempted, List<Map<String, Object>> results) {}

    public static class DemoSendRequest {
        @NotBlank(message = "Sender VPA is required")
        public String senderVpa;

        @NotBlank(message = "Receiver VPA is required")
        public String receiverVpa;

        @NotNull(message = "Amount is required")
        @Positive(message = "Amount must be positive")
        public BigDecimal amount;

        @NotBlank(message = "PIN is required")
        @Size(min = 4, max = 6, message = "PIN must be 4 to 6 digits")
        public String pin;

        @Min(value = 1, message = "TTL must be at least 1")
        @Max(value = 8, message = "TTL cannot be more than 8")
        public Integer ttl;

        public String startDevice;
    }

    public static class AddMeshDeviceRequest {
        @NotNull(message = "Device type is required")
        public Boolean hasInternet;
    }

    public static class RemoveMeshDeviceRequest {
        @NotNull(message = "Device type is required")
        public Boolean hasInternet;
    }

    public static class GossipRoundsRequest {
        @NotNull(message = "Round count is required")
        @Min(value = 1, message = "Run at least 1 gossip round")
        @Max(value = 10, message = "Run at most 10 gossip rounds at a time")
        public Integer rounds;
    }
}
