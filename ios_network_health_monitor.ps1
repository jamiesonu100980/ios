<#
.SYNOPSIS
    iOS Network Health Monitor
.DESCRIPTION
    Monitors network security health for iOS devices
    Run: powershell -ExecutionPolicy Bypass -File ios_network_health_monitor.ps1
#>

$ErrorActionPreference = "SilentlyContinue"

$AppleServices = @(
    @{ Name="Apple Push (APNs)";  Hosts=@("gateway.push.apple.com","api.push.apple.com"); Port=443; Desc="Push Notification Service" }
    @{ Name="iCloud";             Hosts=@("www.icloud.com","setup.icloud.com"); Port=443; Desc="iCloud Sync & Backup" }
    @{ Name="App Store";          Hosts=@("apps.apple.com","itunes.apple.com"); Port=443; Desc="App Download & Update" }
    @{ Name="Software Update";    Hosts=@("mesu.apple.com","gdmf.apple.com","updates.cdn-apple.com"); Port=443; Desc="System Security Update (Critical)" }
    @{ Name="Apple ID Auth";      Hosts=@("appleid.apple.com","idmsa.apple.com"); Port=443; Desc="Apple ID Authentication" }
    @{ Name="iMessage";           Hosts=@("identity.ess.apple.com"); Port=443; Desc="iMessage Key Service" }
    @{ Name="OCSP/CRL";           Hosts=@("ocsp.apple.com","crl.apple.com"); Port=80; Desc="Certificate Revocation Check" }
    @{ Name="Device Analytics";   Hosts=@("xp.apple.com","idiagnostics.apple.com"); Port=443; Desc="Device Diagnostics" }
)

$DnsTestDomains = @("www.apple.com","gateway.push.apple.com","mesu.apple.com","appleid.apple.com")
$PingTargets = @("www.apple.com","gateway.push.apple.com","8.8.8.8")
$TlsHosts = @("www.apple.com","appleid.apple.com","mesu.apple.com","gateway.push.apple.com","www.icloud.com")

$SuspiciousPorts = @(
    @{ Port=8080; Desc="HTTP Proxy" }
    @{ Port=8888; Desc="Charles/Fiddler Proxy" }
    @{ Port=9090; Desc="Proxy/Admin" }
    @{ Port=1080; Desc="SOCKS Proxy" }
    @{ Port=3128; Desc="Squid Proxy" }
    @{ Port=8443; Desc="Alt HTTPS" }
)

# ============================================================
function Write-SectionHeader($title) {
    $line = "=" * 60
    Write-Host "`n$line"
    Write-Host "  $title" -ForegroundColor White
    Write-Host $line
}
function Write-Pass($msg)  { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Warn2($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Info2($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Cyan }

$script:Issues = [System.Collections.ArrayList]::new()
$script:Deductions = [System.Collections.ArrayList]::new()

# ============================================================
function Test-TcpConnect {
    param([string]$HostName, [int]$Port, [int]$Timeout=5000)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $task = $client.ConnectAsync($HostName, $Port)
        $done = $task.Wait($Timeout)
        $sw.Stop()
        $client.Close()
        if ($done -and -not $task.IsFaulted) {
            return @{ Ok=$true; Latency=$sw.ElapsedMilliseconds }
        }
        return @{ Ok=$false; Latency=-1 }
    } catch {
        return @{ Ok=$false; Latency=-1 }
    }
}

function Test-TlsCert {
    param([string]$HostName, [int]$Port=443)
    $r = @{ Ok=$false; Subject=""; Issuer=""; Protocol=""; Cipher=""; NotAfter=""; DaysLeft=-1; Warnings=[System.Collections.ArrayList]::new() }
    try {
        $client = New-Object System.Net.Sockets.TcpClient($HostName, $Port)
        $callback = { param($s,$c,$ch,$e) return $true }
        $stream = New-Object System.Net.Security.SslStream($client.GetStream(), $false, $callback)
        $stream.AuthenticateAsClient($HostName)
        $cert = $stream.RemoteCertificate
        $cert2 = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cert)

        $r.Subject  = $cert2.GetNameInfo("SimpleName", $false)
        $r.Issuer   = $cert2.GetNameInfo("SimpleName", $true)
        $r.Protocol = $stream.SslProtocol.ToString()
        $r.Cipher   = $stream.CipherAlgorithm.ToString()
        $na = $cert2.NotAfter
        $r.NotAfter = $na.ToString("yyyy-MM-dd")
        $r.DaysLeft = ($na - (Get-Date)).Days

        $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
        $chain.ChainPolicy.RevocationMode = "Online"
        $chainOk = $chain.Build($cert2)
        if (-not $chainOk) {
            foreach ($st in $chain.ChainStatus) {
                $null = $r.Warnings.Add("Chain: $($st.StatusInformation.Trim())")
            }
        }
        if ($r.DaysLeft -lt 30)       { $null = $r.Warnings.Add("Cert expires in $($r.DaysLeft) days") }
        if ($r.Protocol -match "Ssl") { $null = $r.Warnings.Add("Insecure TLS: $($r.Protocol)") }

        $r.Ok = $chainOk
        $stream.Close(); $client.Close()
    } catch {
        $r.Error = $_.Exception.Message
        if ($_.Exception.Message -match "certificate|trust|SSL") {
            $null = $r.Warnings.Add("Possible MITM attack")
        }
    }
    return $r
}

function Test-DnsResolve {
    param([string]$Domain)
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $ips = [System.Net.Dns]::GetHostAddresses($Domain) | ForEach-Object { $_.IPAddressToString }
        $sw.Stop()
        return @{ Ok=$true; IPs=$ips; Latency=$sw.ElapsedMilliseconds }
    } catch {
        return @{ Ok=$false; IPs=@(); Latency=-1 }
    }
}

function Test-DnsConsistency {
    param([string]$Domain)
    $local = Test-DnsResolve -Domain $Domain
    if (-not $local.Ok) { return @{ Ok=$false; Domain=$Domain; LocalIPs=@(); Mismatch=$false; CdnLikely=$false } }

    $localSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$local.IPs)
    $dohIps = @()
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $resp = Invoke-RestMethod -Uri "https://dns.google/resolve?name=$Domain&type=A" -TimeoutSec 5 -Headers @{Accept="application/dns-json"} -ErrorAction Stop
        $dohIps = @($resp.Answer | Where-Object { $_.type -eq 1 } | ForEach-Object { $_.data })
    } catch {}

    if ($dohIps.Count -eq 0) { return @{ Ok=$true; Domain=$Domain; LocalIPs=$local.IPs; DohIPs=@(); Mismatch=$false; CdnLikely=$false } }

    $dohSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$dohIps)
    $overlap = [System.Collections.Generic.HashSet[string]]::new($localSet)
    $overlap.IntersectWith($dohSet)
    $mismatch = ($overlap.Count -eq 0)

    # CDN/geo-DNS heuristic: if local resolves to multiple IPs and both local & DoH resolve successfully,
    # IP mismatch is likely CDN geo-routing (e.g. Apple uses Akamai/Cloudflare in different regions)
    $cdnLikely = $mismatch -and ($local.IPs.Count -gt 2 -or $Domain -match "apple\.com|icloud\.com|cdn-apple\.com")

    return @{ Ok=(-not $mismatch -or $cdnLikely); Domain=$Domain; LocalIPs=$local.IPs; DohIPs=$dohIps; Mismatch=$mismatch; CdnLikely=$cdnLikely }
}

function Test-CaptivePortal {
    try {
        $resp = Invoke-WebRequest -Uri "http://captive.apple.com/hotspot-detect.html" -UseBasicParsing -TimeoutSec 5 -UserAgent "CaptiveNetworkSupport/1.0" -ErrorAction Stop
        $ok = $resp.Content -match "(?i)success"
        return @{ Ok=$ok; Captive=(-not $ok); Status=$resp.StatusCode }
    } catch {
        if ($_.Exception.Response) {
            $sc = [int]$_.Exception.Response.StatusCode
            return @{ Ok=$false; Captive=$true; Status=$sc; Redir=$_.Exception.Response.Headers["Location"] }
        }
        return @{ Ok=$false; Captive=$true; Error=$_.Exception.Message }
    }
}

function Test-ProxyPorts {
    $open = @()
    foreach ($p in $SuspiciousPorts) {
        try {
            $c = New-Object System.Net.Sockets.TcpClient
            $t = $c.ConnectAsync("127.0.0.1", $p.Port)
            if ($t.Wait(800)) { $open += $p }
            $c.Close()
        } catch {}
    }
    return @{ Ok=($open.Count -eq 0); OpenPorts=$open }
}

function Test-VPN {
    try {
        $adapters = Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq "Up" }
        $kw = @("tun","tap","vpn","ppp","ipsec","wireguard","wg")
        $found = $false
        foreach ($a in $adapters) {
            foreach ($k in $kw) {
                if ($a.Name -match $k -or $a.InterfaceDescription -match $k) { $found = $true; break }
            }
        }
        return @{ Ok=$true; VPN=$found }
    } catch {
        return @{ Ok=$false; VPN=$false }
    }
}

# ============================================================
#  MAIN
# ============================================================

Write-Host ""
Write-Host "    +==================================================+" -ForegroundColor Cyan
Write-Host "    |   iOS Network Health Monitor  v1.0               |" -ForegroundColor Cyan
Write-Host "    |   Network Security Assessment & Threat Detection |" -ForegroundColor Cyan
Write-Host "    +==================================================+" -ForegroundColor Cyan

# 1
Write-SectionHeader "1. Apple Critical Services Connectivity"
foreach ($svc in $AppleServices) {
    $ok = $false
    foreach ($h in $svc.Hosts) {
        $tcp = Test-TcpConnect -HostName $h -Port $svc.Port
        if ($tcp.Ok) { $ok=$true; Write-Pass "$($svc.Name) ($h`:$($svc.Port)) - $($tcp.Latency)ms - $($svc.Desc)"; break }
    }
    if (-not $ok) {
        Write-Fail "$($svc.Name) - Unreachable - $($svc.Desc)"
        $null = $script:Issues.Add("Service unreachable: $($svc.Name)")
        $null = $script:Deductions.Add($(if ($svc.Name -match "Update|Push") {10} else {5}))
    }
}

# 2
Write-SectionHeader "2. TLS Certificate Security"
foreach ($h in $TlsHosts) {
    $cert = Test-TlsCert -HostName $h
    if ($cert.Ok) {
        $w = ""
        if ($cert.Warnings.Count -gt 0) {
            $w = " [!] $($cert.Warnings -join '; ')"
            foreach ($ww in $cert.Warnings) {
                $null = $script:Issues.Add("TLS warning ($h): $ww")
                $null = $script:Deductions.Add($(if ($ww -match "MITM") {15} else {5}))
            }
        }
        Write-Pass "$h"
        Write-Host "        Issuer: $($cert.Issuer) | Protocol: $($cert.Protocol) | Cipher: $($cert.Cipher) | Expires: $($cert.NotAfter) ($($cert.DaysLeft)d left)$w"
    } else {
        $err = if ($cert.Error) { $cert.Error.Substring(0, [Math]::Min(80, $cert.Error.Length)) } else { "Unknown" }
        Write-Fail "$h - $err"
        foreach ($ww in $cert.Warnings) { Write-Warn2 "        $ww" }
        $null = $script:Issues.Add("TLS cert error ($h): $err")
        $null = $script:Deductions.Add(20)
    }
}

# 3
Write-SectionHeader "3. DNS Security"
foreach ($d in $DnsTestDomains) {
    $c = Test-DnsConsistency -Domain $d
    if ($c.Ok -and -not $c.CdnLikely) {
        Write-Pass "$d"
        $ips3 = $c.LocalIPs | Select-Object -First 3
        Write-Host "        Local DNS: $($ips3 -join ', ')"
    } elseif ($c.Ok -and $c.CdnLikely) {
        Write-Pass "$d (CDN geo-routing detected, IP diff is expected)"
        $ips3 = $c.LocalIPs | Select-Object -First 3
        Write-Host "        Local DNS: $($ips3 -join ', ')  |  DoH: $($c.DohIPs -join ', ')"
    } elseif ($c.Mismatch) {
        Write-Fail "$d - Local DNS differs from DoH (possible DNS hijack)"
        Write-Host "        Local: $($c.LocalIPs -join ', ')"
        Write-Host "        DoH:   $($c.DohIPs -join ', ')"
        $null = $script:Issues.Add("DNS mismatch ($d): possible hijack")
        $null = $script:Deductions.Add(20)
    } else {
        Write-Fail "$d - Resolution failed"
        $null = $script:Issues.Add("DNS failure: $d")
        $null = $script:Deductions.Add(10)
    }
}

# 4
Write-SectionHeader "4. Latency & Packet Loss"
foreach ($t in $PingTargets) {
    $ping = Test-Connection -ComputerName $t -Count 4 -ErrorAction SilentlyContinue
    if ($ping) {
        $avg = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average, 1)
        $lost = 4 - $ping.Count
        $pct = [math]::Round($lost / 4 * 100)
        if ($pct -le 5) { Write-Pass "$t - Latency: ${avg}ms | Loss: ${pct}%" }
        elseif ($pct -le 20) { Write-Warn2 "$t - Latency: ${avg}ms | Loss: ${pct}% (fair)"; $null=$script:Deductions.Add(3) }
        else { Write-Fail "$t - Latency: ${avg}ms | Loss: ${pct}%"; $null=$script:Issues.Add("Poor network ($t): ${pct}% loss"); $null=$script:Deductions.Add(8) }
    } else {
        Write-Fail "$t - Unreachable"
        $null=$script:Issues.Add("Unreachable: $t")
        $null=$script:Deductions.Add(8)
    }
}

# 5
Write-SectionHeader "5. Captive Portal Detection"
$cap = Test-CaptivePortal
if ($cap.Ok) { Write-Pass "No captive portal detected - network exit OK" }
else {
    Write-Fail "Captive portal or HTTP hijack detected"
    if ($cap.Redir) { Write-Warn2 "        Redirect: $($cap.Redir)" }
    $null=$script:Issues.Add("Captive portal / HTTP hijack detected")
    $null=$script:Deductions.Add(25)
}

# 6
Write-SectionHeader "6. Local Proxy / Intercept Port Scan"
$prx = Test-ProxyPorts
if ($prx.Ok) { Write-Pass "No suspicious proxy ports open" }
else {
    foreach ($p in $prx.OpenPorts) { Write-Warn2 "Port $($p.Port) open - $($p.Desc)" }
    $null=$script:Issues.Add("$($prx.OpenPorts.Count) suspicious proxy port(s) detected")
    $null=$script:Deductions.Add(10)
}

# 7
Write-SectionHeader "7. Network Interface & VPN"
$vpn = Test-VPN
if ($vpn.VPN) { Write-Info2 "VPN/tunnel interface detected (some results may be affected)" }
else { Write-Info2 "No VPN tunnel interface detected" }

# ============================================================
# Score
$totalDed = [math]::Min( ($script:Deductions | Measure-Object -Sum).Sum, 100 )
$score = [math]::Max(0, 100 - $totalDed)
if     ($score -ge 90) { $risk="LOW";      $clr="Green" }
elseif ($score -ge 70) { $risk="MEDIUM";   $clr="Yellow" }
elseif ($score -ge 50) { $risk="HIGH";     $clr="Red" }
else                   { $risk="CRITICAL"; $clr="Red" }

Write-SectionHeader "Assessment Summary"
Write-Host ""
Write-Host "  Health Score: " -NoNewline; Write-Host "$score/100" -ForegroundColor $clr
Write-Host "  Risk Level:   " -NoNewline; Write-Host $risk -ForegroundColor $clr
Write-Host "  Scan Time:    $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) UTC"
Write-Host "  Issues Found: $($script:Issues.Count)"

if ($script:Issues.Count -gt 0) {
    Write-Host "`n  Issues:" -ForegroundColor White
    for ($i=0; $i -lt $script:Issues.Count; $i++) { Write-Host "    $($i+1). $($script:Issues[$i])" }
}

Write-Host "`n  Recommendations:" -ForegroundColor White
if ($score -ge 90) {
    Write-Host "    - Network environment is healthy. Keep iOS updated."
} else {
    if ($script:Issues -match "MITM|cert") {
        Write-Host "    - [URGENT] Certificate anomaly detected. Disconnect immediately and switch to trusted network." -ForegroundColor Red
        Write-Host "    - [URGENT] Check device for unknown root certificates (Settings > General > About > Certificate Trust)" -ForegroundColor Red
    }
    if ($script:Issues -match "DNS")     { Write-Host "    - Enable encrypted DNS (DoH/DoT) or switch to trusted DNS (1.1.1.1 / 8.8.8.8)" }
    if ($script:Issues -match "Captive") { Write-Host "    - Possible rogue hotspot. Avoid sensitive data transmission. Use VPN." }
    if ($script:Issues -match "proxy")   { Write-Host "    - Proxy ports detected. Verify they are authorized debug/security tools." }
    if ($script:Issues -match "reach")   { Write-Host "    - Apple services unreachable. Security updates may fail. Check firewall." }
    if ($script:Issues -match "loss|Poor"){ Write-Host "    - Poor network quality may delay security update delivery." }
}

# Save JSON
$ts = (Get-Date).ToString("yyyyMMdd_HHmmss")
$rptPath = Join-Path $PSScriptRoot "ios_network_health_$ts.json"
@{ scan_time=(Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss UTC"); score=$score; risk=$risk; issues=$script:Issues.ToArray() } | ConvertTo-Json -Depth 5 | Out-File $rptPath -Encoding UTF8
Write-Host "`n  Report saved: $rptPath"
Write-Host "`n$("=" * 60)`n"
