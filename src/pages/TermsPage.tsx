import { Calendar, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { usePageMeta } from '@/lib/usePageMeta'

const SECTIONS = [
  {
    title: '1. Acceptance of terms',
    body: 'By accessing or using PayLens you agree to be bound by these terms. If you do not agree, do not use the platform. These terms apply to all visitors, users, and others who access the service.',
  },
  {
    title: '2. Service description',
    body: 'PayLens is a payroll analytics platform that provides role-based dashboards, payroll processing workflows, anomaly detection, forecasting, reports, audit logs, and related tooling. The platform is provided as a software service; integrations with third-party payroll providers are the customer’s responsibility.',
  },
  {
    title: '3. User accounts',
    body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately at hello@paylens.co if you believe your account has been compromised.',
  },
  {
    title: '4. Acceptable use',
    body: 'You agree not to misuse the platform, including by attempting to access systems you are not authorised to access, interfering with security features, uploading malicious content, or using the platform to violate any applicable law or regulation.',
  },
  {
    title: '5. Intellectual property',
    body: 'The platform, including its design, code, brand, and content, is the intellectual property of PayLens and its licensors. You retain ownership of the data you upload. You grant us a limited licence to host and process that data solely to provide the service.',
  },
  {
    title: '6. Disclaimers',
    body: 'The platform is provided "as is" and "as available". To the maximum extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the platform will be uninterrupted or error-free.',
  },
  {
    title: '7. Limitation of liability',
    body: 'To the maximum extent permitted by law, our aggregate liability arising out of or related to your use of the platform will not exceed the greater of (a) the fees paid by you for the platform in the twelve months preceding the claim, or (b) one hundred US dollars. We will not be liable for indirect, incidental, or consequential damages.',
  },
  {
    title: '8. Termination',
    body: 'We may suspend or terminate access to the platform at any time for conduct that violates these terms or is otherwise harmful to other users. You may stop using the platform at any time. Provisions that by their nature should survive termination will do so.',
  },
  {
    title: '9. Changes',
    body: 'We may update these terms from time to time. Material changes will be communicated through the platform. Continued use after a change indicates acceptance of the updated terms.',
  },
  {
    title: '10. Governing law',
    body: 'These terms are governed by the laws of the jurisdiction in which PayLens operates, without regard to conflict-of-laws provisions. Any disputes will be resolved in the competent courts of that jurisdiction.',
  },
  {
    title: '11. Contact',
    body: 'Questions about these terms can be sent to hello@paylens.co.',
  },
]

export function TermsPage() {
  usePageMeta(
    'Terms and conditions · PayLens',
    'The terms governing your use of the PayLens platform.',
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Legal"
        title="Terms and Conditions"
        description="Last updated October 2026. This is a template agreement. Replace the jurisdiction clause and review with counsel before going live."
      />

      <Card>
        <CardContent className="space-y-7 p-6 text-sm leading-relaxed md:p-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="mb-2 text-base font-semibold tracking-tight">{s.title}</h2>
              <p className="text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" />
          Effective October 2026
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" />
          Version 1.0
        </div>
      </div>
    </div>
  )
}