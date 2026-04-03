# DHIS2 Mauritania — VPN Routing Setup

## Overview

Route traffic to `dhis2.sante.gov.mr` (`82.151.65.202`) through a Mullvad VPN
exit node in South Africa using WireGuard. Only this one IP is routed through
the VPN — all other server traffic is unaffected. No application code changes
needed.

```
App (Deno/Hono) → fetch("https://dhis2.sante.gov.mr/...")
                       ↓
              OS routing table sees 82.151.65.202
                       ↓
              Routes through wg0 (WireGuard) → Mullvad South Africa → Mauritania

All other traffic → normal DO network interface (unchanged)
```

## 1. Mullvad account

1. Go to https://mullvad.net/en/account
2. Click "Generate account number" — no email or signup needed
3. Add credit (EUR 5/month, or pay with crypto for 10% off)
4. Go to https://mullvad.net/en/account/wireguard-config
5. Generate a config for **South Africa (Johannesburg)**
6. Download the `.conf` file

## 2. Install WireGuard on DO server

```bash
ssh root@<your-do-server-ip>

apt update && apt install -y wireguard
```

## 3. Configure WireGuard with split routing

Copy the config to the server:

```bash
scp mullvad-za.conf root@<your-do-server-ip>:/etc/wireguard/wg-mullvad.conf
```

Edit the config:

```bash
nano /etc/wireguard/wg-mullvad.conf
```

The downloaded config will look something like:

```ini
[Interface]
PrivateKey = <your-private-key>
Address = <assigned-ip>/32
DNS = <mullvad-dns>

[Peer]
PublicKey = <mullvad-public-key>
AllowedIPs = 0.0.0.0/0       # ← CHANGE THIS LINE
Endpoint = <mullvad-server>:<port>
```

Make two changes:

1. **Change `AllowedIPs`** to route only the DHIS2 Mauritania IP:

   ```ini
   AllowedIPs = 82.151.65.202/32
   ```

2. **Remove the `DNS` line** — DNS should go through the normal network path.

Final config:

```ini
[Interface]
PrivateKey = <your-private-key>
Address = <assigned-ip>/32

[Peer]
PublicKey = <mullvad-public-key>
AllowedIPs = 82.151.65.202/32
Endpoint = <mullvad-server>:<port>
```

## 4. Test

```bash
# Bring up the tunnel
wg-quick up wg-mullvad

# Verify WireGuard is running
wg show

# Test DHIS2 Mauritania is reachable
curl -sI --max-time 15 https://dhis2.sante.gov.mr/

# Verify normal traffic is NOT going through the VPN
curl ifconfig.me
# ^ Should show your normal DO server IP, NOT a South African IP

# If something goes wrong
wg-quick down wg-mullvad
```

Expected: an HTTP response (200, 302, or login redirect) from the DHIS2 curl.
If it times out, the tunnel isn't working.

## 5. Enable on boot

```bash
systemctl enable wg-quick@wg-mullvad
systemctl start wg-quick@wg-mullvad
```

Verify it survives a reboot:

```bash
reboot
# After reconnecting:
wg show
curl -sI --max-time 15 https://dhis2.sante.gov.mr/
```

## 6. Verify application works

Run the DHIS2 connection test from the app. The application code
(`server/dhis2/common/base_fetcher.ts`) uses standard `fetch()` which
automatically uses the OS routing table — no code changes needed.

## Maintenance

- **Mullvad subscription**: EUR 5/month. Top up before it expires or the tunnel
  stops working.
- **If DHIS2 IP changes**: Run `dig dhis2.sante.gov.mr +short`, update
  `AllowedIPs` in `/etc/wireguard/wg-mullvad.conf`, then
  `systemctl restart wg-quick@wg-mullvad`.
- **Stale tunnel**: If `wg show` shows an old handshake timestamp, restart:
  `wg-quick down wg-mullvad && wg-quick up wg-mullvad`
- **Key rotation**: Mullvad WireGuard keys don't expire on their own, but if you
  regenerate keys on the Mullvad site, download a new config and replace
  `/etc/wireguard/wg-mullvad.conf`.
- **Adding other blocked DHIS2 instances**: Add IPs to `AllowedIPs`:
  ```ini
  AllowedIPs = 82.151.65.202/32, <other-ip>/32
  ```

## Fallback

If South Africa stops working, switch to ProtonVPN which has Nigeria servers
(confirmed working). ProtonVPN provides WireGuard configs the same way — the
setup steps are identical, just a different `.conf` file. ProtonVPN requires
email signup and a paid plan ($3.99/month annual).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `wg-quick up` fails | Is WireGuard installed? `apt install wireguard` |
| Tunnel up but DHIS2 times out | `wg show` — is there a recent handshake? If not, config may be invalid |
| All traffic routing through VPN | `AllowedIPs` is still `0.0.0.0/0` — change to `82.151.65.202/32` |
| Normal server traffic broken | Same as above |
| Works manually but not after reboot | `systemctl status wg-quick@wg-mullvad` |
| DNS resolution fails | Unrelated to VPN. Check `dig dhis2.sante.gov.mr` |
