# DHIS2 Mauritania — Routing Setup

## Problem

The Mauritania DHIS2 instance (`dhis2.sante.gov.mr` / `82.151.65.202`) blocks
connections from our Digital Ocean server in NYC. We need to route DHIS2
Mauritania traffic through an African exit point.

## What we've confirmed

- The site is accessible from West African IPs (tested from Cote d'Ivoire)
- Nigerian exit IPs work (tested via Windscribe WireGuard)
- South African exit IPs work (tested via Windscribe WireGuard)
- European IPs (France, Germany, etc.) do NOT work
- US / cloud provider IPs do NOT work
- Only traffic to `82.151.65.202` needs to be rerouted — all other server
  traffic stays on the normal network path
- No application code changes are needed for either option

## Two options

|                              | Option A: Windscribe VPN                   | Option B: AWS South Africa Proxy  |
|------------------------------|--------------------------------------------|-----------------------------------|
| **Cost**                     | $3/month                                   | ~$6/month (t4g.micro)             |
| **Setup time**               | ~30 minutes                                | ~1-2 hours                        |
| **App code changes**         | None (OS-level routing)                    | Yes — point DHIS2 URL at proxy    |
| **Infrastructure to manage** | None (third-party service)                 | A VPS (patching, monitoring)      |
| **Reliability**              | Depends on Windscribe uptime, key rotation | You control everything            |
| **Third-party dependency**   | Yes — Windscribe                           | No                                |
| **Config expiry risk**       | Yes — WireGuard keys may rotate            | No                                |
| **Best for**                 | Quick/cheap, low-criticality               | Production, long-term reliability |

**Recommendation**: Start with Option A to unblock immediately. If DHIS2
connectivity becomes a critical production path, migrate to Option B.

---

## Option A: Windscribe WireGuard

Use Windscribe VPN (Build A Plan — Nigeria or South Africa, $3/month) with
WireGuard on the DO server. Configure split routing so only packets to
`82.151.65.202` go through the VPN tunnel.

```
App (Deno/Hono) → fetch("https://dhis2.sante.gov.mr/...")
                       ↓
              OS routing table sees 82.151.65.202
                       ↓
              Routes through wg0 (WireGuard) → African VPN exit → Mauritania

All other traffic → normal DO network interface (unchanged)
```

### A1. Windscribe account

1. Sign up at <https://windscribe.com/upgrade>
2. Choose "Build A Plan"
3. Add **Nigeria** or **South Africa** ($3/month)
4. Go to <https://windscribe.com/getconfig/wireguard>
5. Select the location
6. Download the generated `.conf` file

### A2. Install WireGuard on DO server

```bash
ssh root@<your-do-server-ip>

apt update && apt install -y wireguard
```

### A3. Configure WireGuard with split routing

Copy the downloaded Windscribe config to the server:

```bash
scp Windscribe-Nigeria.conf root@<your-do-server-ip>:/etc/wireguard/wg-nigeria.conf
```

Edit the config on the server:

```bash
nano /etc/wireguard/wg-nigeria.conf
```

The config will look something like this:

```ini
[Interface]
PrivateKey = <your-private-key>
Address = <assigned-ip>/32
DNS = <windscribe-dns>

[Peer]
PublicKey = <windscribe-public-key>
AllowedIPs = 0.0.0.0/0       # ← CHANGE THIS LINE
Endpoint = <windscribe-server>:<port>
```

Make two changes:

1. **Change `AllowedIPs`** to route only the DHIS2 Mauritania IP:

   ```ini
   AllowedIPs = 82.151.65.202/32
   ```

2. **Remove the `DNS` line** — you don't want to route DNS through the VPN.

Final config should look like:

```ini
[Interface]
PrivateKey = <your-private-key>
Address = <assigned-ip>/32

[Peer]
PublicKey = <windscribe-public-key>
AllowedIPs = 82.151.65.202/32
Endpoint = <windscribe-server>:<port>
```

### A4. Test it

```bash
# Bring up the tunnel
wg-quick up wg-nigeria

# Verify WireGuard is running
wg show

# Test that DHIS2 Mauritania is reachable
curl -sI --max-time 15 https://dhis2.sante.gov.mr/

# Verify normal traffic is NOT going through the VPN
curl ifconfig.me
# ^ Should show your normal DO server IP, NOT a Nigerian IP

# If something goes wrong, bring it down
wg-quick down wg-nigeria
```

Expected result from the DHIS2 curl: an HTTP response (200, 302, or a login
page redirect). If it times out, the VPN routing isn't working.

### A5. Enable on boot

```bash
systemctl enable wg-quick@wg-nigeria
systemctl start wg-quick@wg-nigeria
```

Verify it survives a reboot:

```bash
reboot
# After reconnecting:
wg show
curl -sI --max-time 15 https://dhis2.sante.gov.mr/
```

### A6. Verify application works

Run the DHIS2 connection test from the app. The application code
(`server/dhis2/common/base_fetcher.ts`) uses standard `fetch()` which
automatically uses the OS routing table — no code changes needed.

### Option A maintenance

- **Windscribe subscription**: $3/month, must stay active
- **If DHIS2 IP changes**: Update `AllowedIPs` in
  `/etc/wireguard/wg-nigeria.conf` and restart:
  `systemctl restart wg-quick@wg-nigeria`. Check with
  `dig dhis2.sante.gov.mr +short`
- **If VPN stops working**: Check `wg show` — if the handshake timestamp is old,
  the tunnel may be stale. Try
  `wg-quick down wg-nigeria && wg-quick up wg-nigeria`
- **Windscribe config expiry**: WireGuard configs may expire or keys may rotate.
  Regenerate at <https://windscribe.com/getconfig/wireguard> and replace
  `/etc/wireguard/wg-nigeria.conf`
- **Adding other blocked DHIS2 instances**: Add IPs to `AllowedIPs` as a
  comma-separated list:

  ```ini
  AllowedIPs = 82.151.65.202/32, <other-ip>/32
  ```

---

## Option B: AWS South Africa Reverse Proxy

Run a small EC2 instance in AWS Cape Town (`af-south-1`) as a reverse proxy.
Your DO server sends DHIS2 requests to the proxy, which forwards them to
Mauritania from a South African IP.

```
App (Deno/Hono) → fetch("https://<proxy-ip>/api/...")
                       ↓
              DO server → AWS Cape Town proxy → dhis2.sante.gov.mr

All other traffic → direct from DO server (unchanged)
```

### B1. Create EC2 instance

1. Log into AWS Console
2. Switch region to **Africa (Cape Town) `af-south-1`**
   - Note: you may need to enable this region first in Account Settings — it's
     an opt-in region
3. Launch an EC2 instance:
   - **AMI**: Ubuntu 24.04 LTS (arm64 for t4g)
   - **Instance type**: `t4g.micro` (2 vCPU, 1 GB RAM — ~$6/month)
   - **Storage**: 8 GB gp3 (default is fine)
   - **Security group**: Allow inbound on port 443 (HTTPS) from your DO
     server's IP only. Allow SSH (port 22) from your IP for management.
   - **Key pair**: Create or use existing
4. Note the **Elastic IP** — assign one so the IP doesn't change on reboot

### B2. Install Deno on the proxy

```bash
ssh -i <key.pem> ubuntu@<proxy-ip>

# Install Deno
curl -fsSL https://deno.land/install.sh | sh
echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### B3. Create the proxy server

Create `/home/ubuntu/dhis2-proxy/main.ts`:

```typescript
const ALLOWED_TARGET = "https://dhis2.sante.gov.mr";

Deno.serve({ port: 443, cert, key }, async (req) => {
  const url = new URL(req.url);
  const targetUrl = ALLOWED_TARGET + url.pathname + url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");

  try {
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.body,
    });

    const respHeaders = new Headers(resp.headers);
    return new Response(resp.body, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (e) {
    return new Response(`Proxy error: ${e}`, { status: 502 });
  }
});
```

Note: For TLS, you'll need a cert. Options:

- Use a self-signed cert and disable TLS verification on the DO side for this
  one connection
- Use Let's Encrypt with a domain pointing at the proxy
- Run on HTTP (port 8080) and rely on the security group to restrict access to
  only your DO server IP

Simpler version without TLS (if security group locks it to your DO IP):

```typescript
const ALLOWED_TARGET = "https://dhis2.sante.gov.mr";

Deno.serve({ port: 8080 }, async (req) => {
  const url = new URL(req.url);
  const targetUrl = ALLOWED_TARGET + url.pathname + url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");

  try {
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.body,
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: resp.headers,
    });
  } catch (e) {
    return new Response(`Proxy error: ${e}`, { status: 502 });
  }
});
```

### B4. Run as a systemd service

Create `/etc/systemd/system/dhis2-proxy.service`:

```ini
[Unit]
Description=DHIS2 Reverse Proxy
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/dhis2-proxy
ExecStart=/home/ubuntu/.deno/bin/deno run --allow-net main.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable dhis2-proxy
sudo systemctl start dhis2-proxy
sudo systemctl status dhis2-proxy
```

### B5. Test the proxy

From the proxy itself:

```bash
curl -sI --max-time 15 https://dhis2.sante.gov.mr/
# Should get a response — confirms South African IP can reach Mauritania
```

From your DO server:

```bash
curl -sI --max-time 15 http://<proxy-ip>:8080/api/system/info.json
# Should get a response proxied through Cape Town
```

### B6. Update application code

In `server/dhis2/common/base_fetcher.ts`, the `fetchFromDHIS2` function builds
URLs using `dhis2Credentials.url`. For Mauritania connections, the DHIS2 URL in
the credentials should point to the proxy instead:

```
# Instead of:
https://dhis2.sante.gov.mr

# Use:
http://<proxy-elastic-ip>:8080
```

This is a config change, not a code change. The proxy forwards the path and
headers to the real DHIS2 instance.

### Option B maintenance

- **EC2 cost**: ~$6/month for t4g.micro
- **OS patching**: Run `apt update && apt upgrade` periodically
- **Monitoring**: Check `systemctl status dhis2-proxy` and set up a simple
  health check (e.g., cron job that curls the proxy)
- **If DHIS2 IP changes**: No change needed — the proxy resolves
  `dhis2.sante.gov.mr` via DNS on each request
- **Scaling**: t4g.micro is more than enough for DHIS2 API calls. No need to
  scale unless you're making thousands of concurrent requests
- **Security**: Keep the security group locked to your DO server IP. Update it
  if your DO IP changes.

---

## Troubleshooting (both options)

| Symptom                                       | Check                                                                                                 |
|-----------------------------------------------|-------------------------------------------------------------------------------------------------------|
| DHIS2 still times out                         | Verify the African exit IP can reach the site: `curl` from the proxy/VPN directly                     |
| `wg-quick up` fails (Option A)                | Is WireGuard installed? `apt install wireguard`                                                       |
| All traffic routing through VPN (Option A)    | Check `AllowedIPs` is `82.151.65.202/32`, not `0.0.0.0/0`                                             |
| Proxy returns 502 (Option B)                  | SSH into proxy, check `systemctl status dhis2-proxy` and test `curl` to DHIS2 directly from the proxy |
| Works manually but not after reboot           | Option A: `systemctl status wg-quick@wg-nigeria`. Option B: `systemctl status dhis2-proxy`            |
| DNS resolution fails for `dhis2.sante.gov.mr` | Unrelated to VPN/proxy. Check `dig dhis2.sante.gov.mr` from the DO server                             |
