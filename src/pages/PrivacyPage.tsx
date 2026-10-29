import { Calendar, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { usePageMeta } from '@/lib/usePageMeta'

const SECTIONS = [
  {
    title: '1. Information we collect',
    body: 'PayLens collects information you provide when using the platform. This includes account details (name, role, email), employee records (compensation, attendance, documents), and usage data (page views, feature interactions). All demo data shipped with the platform is synthetic and does not correspond to real individuals.',
  },
  {
    title: '2. How we use your information',
    body: 'We use the information we collect to operate and maintain the platform, personalise the experience based on your role, send operational notifications, and improve the product over time. We do not sell your data to third parties, and we do not use your data to train third-party models.',
  },
  {
    title: '3. Data storage and security',
    body: 'Data is stored on infrastructure operated by reputable providers with industry-standard encryption in transit and at rest. Access to production data is restricted to authorised personnel through authenticated sessions. You can review and revoke active sessions at any time from Settings.',
  },
  {
    title: '4. Sharing your information',
    body: 'We share information only with the service providers that help us operate the platform (hosting, email delivery, error tracking). These providers are bound by confidentiality and data-processing terms. We may also disclose information where required by law.',
  },
  {
    title: '5. Your rights',
    body: 'You can access, correct, export, or delete your data at any time. Contact us at the address below to exercise these rights. We respond to verified requests within applicable statutory windows.',
  },
  {
    title: '6. Cookies',
    body: 'PayLens uses only first-party cookies and local storage to remember your theme preference, sign-in state, and notification read state. We do not use third-party advertising or tracking cookies.',
  },
  {
    title: '7. Changes to this policy',
    body: 'We will post any material changes to this policy on this page with an updated revision date. Continued use of the platform after a change indicates acceptance of the updated policy.',
  },
  {
    title: '8. Contact',
    body: 'Questions about this policy can be sent to hello@paylens.co. We respond to privacy enquiries within five business days.',
  },
]

export function PrivacyPage() {
  usePageMeta(
    'Privacy policy · PayLens',
    'How PayLens collects, uses, stores and protects your data.',
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        description="Last updated October 2026. This is a template policy. Replace the contact details and review with counsel before going live."
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