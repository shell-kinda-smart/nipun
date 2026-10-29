<?php

declare(strict_types=1);

namespace PayLens\Core;

/**
 * JSON response helpers.
 *
 * Every endpoint answers with the same envelope so the frontend client can
 * rely on one shape:
 *
 *   success: {"data": <payload>, "meta": {...}}
 *   failure: {"error": {"code": "...", "message": "...", "details": {...}}}
 */
final class Response
{
    private static int $lastStatus = 200;

    /** The status code of the most recent response (used by the test suite). */
    public static function lastStatus(): int
    {
        return self::$lastStatus;
    }

    public static function json(mixed $data, int $status = 200, array $meta = []): void
    {
        self::$lastStatus = $status;
        if (! headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        echo json_encode(
            $meta === [] ? ['data' => $data] : ['data' => $data, 'meta' => $meta],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        );
    }

    public static function error(string $code, string $message, int $status = 400, array $details = []): void
    {
        self::$lastStatus = $status;
        if (! headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        echo json_encode(
            ['error' => ['code' => $code, 'message' => $message, 'details' => $details]],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
        );
    }

    /** @param array<int,array<string,mixed>> $rows */
    public static function csv(string $filename, array $header, array $rows): void
    {
        self::$lastStatus = 200;
        if (! headers_sent()) {
            http_response_code(200);
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('X-Content-Type-Options: nosniff');
        }
        $out = fopen('php://output', 'wb');
        if ($out === false) {
            return;
        }
        // BOM so Excel opens UTF-8 correctly.
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, $header);
        foreach ($rows as $row) {
            fputcsv($out, array_map(static fn ($v) => self::csvCell($v), $row));
        }
        fclose($out);
    }

    /**
     * Neutralise spreadsheet formula injection.
     *
     * A cell starting with =, +, -, @, tab or CR is interpreted by Excel and
     * Sheets as a formula, which turns exported payroll data into code
     * execution in the opener's spreadsheet. Prefixing with a single quote
     * keeps the value as text.
     */
    public static function csvCell(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        $string = (string) $value;
        if ($string !== '' && str_contains("=+-@\t\r", $string[0])) {
            return "'" . $string;
        }
        return $string;
    }
}
