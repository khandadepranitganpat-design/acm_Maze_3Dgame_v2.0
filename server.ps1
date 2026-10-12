$port = 3000
$ip = "192.168.0.37"
$root = $PSScriptRoot

$tcpListener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
try {
    $tcpListener.Start()
    Write-Host "=========================================================="
    Write-Host "  ACM MAZE SERVER RUNNING FOR MOBILE PHONES & DESKTOPS"
    Write-Host "=========================================================="
    Write-Host "  Wi-Fi Network URL: http://${ip}:${port}/host.html"
    Write-Host "  Local URL:         http://localhost:${port}/host.html"
    Write-Host "=========================================================="
} catch {
    Write-Host "Error starting TCP listener: $_"
    exit
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

while ($true) {
    try {
        $client = $tcpListener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $writer = New-Object System.IO.StreamWriter($stream)

        $requestLine = $reader.ReadLine()
        if (-not $requestLine) {
            $client.Close()
            continue
        }

        # Parse GET /path HTTP/1.1
        $parts = $requestLine.Split(" ")
        $urlPath = if ($parts.Length -ge 2) { $parts[1] } else { "/" }
        $urlPath = $urlPath.Split("?")[0]
        if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/host.html" }

        # Consume remaining headers
        while ($line = $reader.ReadLine()) {
            if ($line.Trim() -eq "") { break }
        }

        $localPath = Join-Path $root ($urlPath.TrimStart('/').Replace('/', '\'))
        if (Test-Path $localPath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = $mimeTypes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }

            $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bytes, 0, $bytes.Length)
        } else {
            $notFound = "HTTP/1.1 404 Not Found`r`nContent-Length: 9`r`nConnection: close`r`n`r`nNot Found"
            $nfBytes = [System.Text.Encoding]::UTF8.GetBytes($notFound)
            $stream.Write($nfBytes, 0, $nfBytes.Length)
        }

        $stream.Flush()
        $client.Close()
    } catch {
        # ignore client disconnect errors
    }
}
