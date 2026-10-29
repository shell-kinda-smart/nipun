<?php

declare(strict_types=1);

namespace PayLens\Services;

/**
 * A small SMTP client.
 *
 * Just enough of RFC 5321 to hand a message to a relay: EHLO, optional
 * AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT. It reports exactly what the
 * server said, so a failed delivery is never mistaken for a sent one.
 */
final class SmtpClient
{
    public function __construct(
        private string $host,
        private int $port,
        private string $username,
        private string $password,
        private string $encryption,
        private int $timeout,
    ) {
    }

    /**
     * @return array{ok:bool,message_id:?string,error:?string}
     */
    public function send(string $fromEmail, string $fromName, string $toEmail, string $subject, string $html): array
    {
        $error = null;

        $remote = ($this->encryption === 'ssl')
            ? 'ssl://' . $this->host . ':' . $this->port
            : $this->host . ':' . $this->port;

        $socket = @stream_socket_client(
            $remote,
            $errno,
            $errstr,
            $this->timeout,
            STREAM_CLIENT_CONNECT,
            $this->encryption === 'tls' ? stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]) : null,
        );

        if ($socket === false) {
            return ['ok' => false, 'message_id' => null, 'error' => "Connection failed: {$errstr} ({$errno})"];
        }
        stream_set_timeout($socket, $this->timeout);

        $read = function () use ($socket): string {
            $line = '';
            while (($chunk = fgets($socket, 515)) !== false) {
                $line .= $chunk;
                if (strlen($chunk) < 4 || $chunk[3] === ' ') {
                    break;
                }
            }
            return $line;
        };
        $write = function (string $line) use ($socket): void {
            fwrite($socket, $line . "\r\n");
        };

        $greeting = $read();
        if (! str_starts_with($greeting, '220')) {
            fclose($socket);
            return ['ok' => false, 'message_id' => null, 'error' => 'Unexpected greeting: ' . trim($greeting)];
        }

        $write('EHLO ' . ($this->host ?: 'localhost'));
        $read();

        if ($this->encryption === 'tls') {
            $write('STARTTLS');
            $tlsResponse = $read();
            if (! str_starts_with($tlsResponse, '220')) {
                fclose($socket);
                return ['ok' => false, 'message_id' => null, 'error' => 'STARTTLS refused: ' . trim($tlsResponse)];
            }
            if (! @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($socket);
                return ['ok' => false, 'message_id' => null, 'error' => 'TLS negotiation failed.'];
            }
            $write('EHLO ' . ($this->host ?: 'localhost'));
            $read();
        }

        if ($this->username !== '') {
            $write('AUTH LOGIN');
            $read();
            $write(base64_encode($this->username));
            $read();
            $write(base64_encode($this->password));
            $authResponse = $read();
            if (! str_starts_with($authResponse, '235')) {
                fclose($socket);
                return ['ok' => false, 'message_id' => null, 'error' => 'Authentication failed: ' . trim($authResponse)];
            }
        }

        $write('MAIL FROM:<' . $fromEmail . '>');
        $mailResponse = $read();
        if (! str_starts_with($mailResponse, '250')) {
            fclose($socket);
            return ['ok' => false, 'message_id' => null, 'error' => 'MAIL FROM refused: ' . trim($mailResponse)];
        }

        $write('RCPT TO:<' . $toEmail . '>');
        $rcptResponse = $read();
        if (! str_starts_with($rcptResponse, '250') && ! str_starts_with($rcptResponse, '251')) {
            fclose($socket);
            return ['ok' => false, 'message_id' => null, 'error' => 'RCPT TO refused: ' . trim($rcptResponse)];
        }

        $write('DATA');
        $dataResponse = $read();
        if (! str_starts_with($dataResponse, '354')) {
            fclose($socket);
            return ['ok' => false, 'message_id' => null, 'error' => 'DATA refused: ' . trim($dataResponse)];
        }

        $messageId = '<' . bin2hex(random_bytes(12)) . '@' . ($this->host ?: 'localhost') . '>';
        $headers = [
            'Date: ' . (new \DateTimeImmutable('now'))->format('D, d M Y H:i:s O'),
            'From: ' . $fromName . ' <' . $fromEmail . '>',
            'To: <' . $toEmail . '>',
            'Subject: ' . $subject,
            'Message-ID: ' . $messageId,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: base64',
            'X-Mailer: PayLens',
        ];

        $body = chunk_split(base64_encode($html), 76, "\r\n");
        fwrite($socket, implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.\r\n");
        $sendResponse = $read();
        if (! str_starts_with($sendResponse, '250')) {
            fclose($socket);
            return ['ok' => false, 'message_id' => null, 'error' => 'Message refused: ' . trim($sendResponse)];
        }

        $write('QUIT');
        fclose($socket);

        return ['ok' => true, 'message_id' => $messageId, 'error' => null];
    }
}
