<?php
// ============================================================
// ProxyMaster Pro — Backend Proxy Checker
// ============================================================
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");

$input = json_decode(file_get_contents("php://input"), true);

if (!$input || empty($input['ip']) || empty($input['port'])) {
    echo json_encode(["status" => "dead", "speed" => 0, "country" => "-", "anonymity" => "-"]);
    exit;
}

$ip   = $input['ip'];
$port = (int)$input['port'];
$user = $input['user'] ?? '';
$pass = $input['pass'] ?? '';

$start = microtime(true);

// ---- 1. CONNECT TO PROXY ----
$fp = @fsockopen($ip, $port, $errno, $errstr, 5);
if (!$fp) {
    echo json_encode(["status" => "dead", "speed" => 0, "country" => "-", "anonymity" => "-"]);
    exit;
}

// ---- 2. BUILD REQUEST ----
$target = "http://httpbin.org/ip";
$headers  = "GET $target HTTP/1.1\r\n";
$headers .= "Host: httpbin.org\r\n";
$headers .= "User-Agent: Mozilla/5.0\r\n";
$headers .= "Connection: close\r\n";

if ($user && $pass) {
    $auth = base64_encode("$user:$pass");
    $headers .= "Proxy-Authorization: Basic $auth\r\n";
}
$headers .= "\r\n";

fwrite($fp, $headers);

// ---- 3. READ RESPONSE ----
stream_set_timeout($fp, 8);
$response = "";
while (!feof($fp)) {
    $response .= fgets($fp, 4096);
}
fclose($fp);

$time_ms = round((microtime(true) - $start) * 1000);

// ---- 4. VALIDATE ----
if (strpos($response, "200 OK") !== false || strpos($response, "\"origin\"") !== false) {
    // Extract body
    $parts = explode("\r\n\r\n", $response, 2);
    $body = $parts[1] ?? "";

    // ---- Anonymity detection ----
    $anon = "Elite";
    if (stripos($response, "Via:") !== false || stripos($response, "X-Forwarded-For") !== false) {
        $anon = "Transparent";
    } elseif (stripos($response, "Proxy-Connection") !== false) {
        $anon = "Anonymous";
    }

    // ---- Country (simple IP API) ----
    $country = "-";
    $data = @json_decode($body, true);
    if (!empty($data['origin'])) {
        $originIp = explode(",", $data['origin'])[0];
        $geo = @file_get_contents("http://ip-api.com/json/" . trim($originIp) . "?fields=country");
        if ($geo) {
            $g = json_decode($geo, true);
            $country = $g['country'] ?? "-";
        }
    }

    echo json_encode([
        "status"    => "live",
        "speed"     => $time_ms,
        "country"   => $country,
        "anonymity" => $anon,
        "ip"        => $ip,
        "port"      => $port,
        "user"      => $user
    ]);
} else {
    echo json_encode([
        "status" => "dead",
        "speed" => $time_ms,
        "country" => "-",
        "anonymity" => "-",
        "ip" => $ip,
        "port" => $port,
        "user" => $user
    ]);
}
