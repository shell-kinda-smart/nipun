<?php
/**
 * One-off refactor: the response envelope already wraps the payload in
 * "data", so controllers must pass the payload itself rather than wrapping
 * it a second time.
 */
$root = dirname(__DIR__) . '/src/Controllers';

foreach (glob($root . '/*.php') as $file) {
    $src = file_get_contents($file);
    $before = $src;

    // Response::json(['data' => X], ...)  ->  Response::json(X, ...)
    $src = preg_replace(
        "/Response::json\(\['data' => (.+?)\](, 201)?\);/",
        'Response::json($1$2);',
        $src,
    );

    if ($src !== $before) {
        file_put_contents($file, $src);
        echo 'updated ' . basename($file) . "\n";
    }
}
