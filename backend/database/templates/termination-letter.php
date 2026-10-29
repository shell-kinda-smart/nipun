<?php
/**
 * Official termination notice.
 *
 * Every value printed here comes from the termination record — nothing is
 * invented. There is no signature image and no statutory claim: the letter
 * states the record's own facts and what happens next.
 *
 * @var string $organisation
 * @var string $hrContact
 * @var string $reference
 * @var string $issueDate
 * @var string $employeeName
 * @var string $employeeId
 * @var string $designation
 * @var string $department
 * @var string $category
 * @var string $lastWorkingDay
 * @var int $noticePeriodDays
 * @var ?string $noticeServedFrom
 * @var string $reason
 */
$e = static fn (string $value): string => htmlspecialchars($value, ENT_QUOTES);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Employment termination notice <?= $e($reference) ?></title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 40px 20px; background: #f4f6fa;
    font-family: Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0b1a33;
  }
  .page {
    max-width: 720px; margin: 0 auto; background: #fff; padding: 56px 60px;
    border: 1px solid #e2e6ee; border-radius: 12px;
  }
  .org { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .kicker { margin-top: 4px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #8b661d; }
  h1 { margin: 36px 0 6px; font-size: 22px; letter-spacing: -0.01em; }
  .ref { margin: 0 0 28px; font-size: 12px; color: #64748b; }
  .rule { height: 3px; background: #c9a54e; width: 64px; margin: 0 0 28px; border-radius: 2px; }
  p { margin: 0 0 16px; font-size: 14px; line-height: 1.7; color: #334155; }
  dl { margin: 0 0 28px; display: grid; grid-template-columns: 200px 1fr; gap: 8px 16px; font-size: 14px; }
  dt { color: #64748b; }
  dd { margin: 0; color: #0b1a33; font-weight: 500; }
  ol { margin: 0 0 28px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #334155; }
  .signoff { margin-top: 44px; padding-top: 24px; border-top: 1px solid #e2e6ee; font-size: 14px; }
  .signoff .name { font-weight: 600; }
  .signoff .role { color: #64748b; font-size: 13px; }
  .foot { margin-top: 32px; font-size: 12px; color: #94a3b8; line-height: 1.6; }
  @media print { body { background: #fff; padding: 0; } .page { border: 0; border-radius: 0; padding: 0; max-width: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="org"><?= $e($organisation) ?></div>
  <div class="kicker">Human Resources</div>

  <h1>Employment termination notice</h1>
  <p class="ref">Reference <?= $e($reference) ?> &nbsp;·&nbsp; Issued <?= $e($issueDate) ?></p>
  <div class="rule"></div>

  <p>Dear <?= $e($employeeName) ?>,</p>

  <p>
    This letter confirms the decision recorded for your employment at
    <?= $e($organisation) ?>. It is issued to you in line with the request
    that was raised and approved, and it sets out the dates that follow.
  </p>

  <dl>
    <dt>Employee</dt><dd><?= $e($employeeName) ?></dd>
    <dt>Employee identifier</dt><dd><?= $e($employeeId) ?></dd>
    <dt>Designation</dt><dd><?= $e($designation) ?></dd>
    <dt>Department</dt><dd><?= $e($department) ?></dd>
    <dt>Nature of separation</dt><dd><?= $e($category) ?></dd>
    <dt>Last working day</dt><dd><?= $e($lastWorkingDay) ?></dd>
    <dt>Notice period</dt><dd><?= (int) $noticePeriodDays ?> day<?= (int) $noticePeriodDays === 1 ? '' : 's' ?></dd>
    <?php if (!empty($noticeServedFrom)): ?>
      <dt>Notice served from</dt><dd><?= $e((string) $noticeServedFrom) ?></dd>
    <?php endif; ?>
  </dl>

  <p>The reason recorded on the request is set out below for your reference.</p>
  <p><?= $e($reason) ?></p>

  <p>What happens next:</p>
  <ol>
    <li>Your final settlement statement is prepared and shared with you in the application.</li>
    <li>Your payslips, employment documents and this notice remain available to you in the application.</li>
    <li>Any question about this notice or your settlement should go to Human Resources at <?= $e($hrContact) ?>.</li>
  </ol>

  <p>
    Please acknowledge that you have received and viewed this notice using the
    action in the application. Acknowledging confirms receipt of this document
    only. It does not mean you agree with the decision recorded above, and it
    does not affect any right you may have.
  </p>

  <div class="signoff">
    <div class="name">Human Resources</div>
    <div class="role"><?= $e($organisation) ?> &nbsp;·&nbsp; <?= $e($hrContact) ?></div>
  </div>

  <p class="foot">
    This notice was issued electronically and is identified by reference
    <?= $e($reference) ?>. It is a generated record; it carries no handwritten or
    electronic signature.
  </p>
</div>
</body>
</html>
