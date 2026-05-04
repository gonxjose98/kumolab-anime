import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service · KumoLab',
    description: "KumoLab's Terms of Service.",
};

export default function TermsPage() {
    return (
        <main className="max-w-3xl mx-auto px-5 py-12 text-[var(--text-primary)]" style={{ lineHeight: 1.7 }}>
            <h1 className="text-3xl md:text-4xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Terms of Service
            </h1>
            <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                Last updated: 2026-05-04
            </p>

            <section className="space-y-6 text-[15px]">
                <p>
                    Welcome to KumoLab (&quot;KumoLab&quot;, &quot;we&quot;, &quot;our&quot;, or
                    &quot;us&quot;). By accessing or using kumolabanime.com or any KumoLab service
                    (the &quot;Service&quot;) you agree to these Terms of Service (the
                    &quot;Terms&quot;). If you do not agree, please do not use the Service.
                </p>

                <h2 className="text-xl font-bold mt-8">1. The Service</h2>
                <p>
                    KumoLab is an anime news and media platform that surfaces, curates, and
                    publishes verified anime news. The Service includes our website, our social
                    media accounts, our APIs, and any related applications we operate.
                </p>

                <h2 className="text-xl font-bold mt-8">2. Use of the Service</h2>
                <p>
                    You may use the Service for personal, non-commercial purposes. You agree not
                    to (a) use the Service in any way that violates any applicable law, (b)
                    attempt to gain unauthorized access to our systems, (c) scrape, mirror, or
                    re-distribute KumoLab content without permission, or (d) use the Service to
                    transmit harmful or unlawful material.
                </p>

                <h2 className="text-xl font-bold mt-8">3. Content & Intellectual Property</h2>
                <p>
                    All KumoLab editorial content, branding, logos, and design elements are owned
                    by KumoLab or licensed to KumoLab. Anime artwork, trailers, and source
                    material featured in our posts remain the property of their respective
                    owners; KumoLab uses such material in an editorial / news-reporting context
                    consistent with fair use. If you are a rights holder and believe content has
                    been used inappropriately, please contact us at the address below and we
                    will respond promptly.
                </p>

                <h2 className="text-xl font-bold mt-8">4. Third-Party Platforms</h2>
                <p>
                    KumoLab publishes content to third-party platforms including Instagram,
                    TikTok, YouTube, Facebook, and Threads. Your use of those platforms through
                    KumoLab is also subject to those platforms&apos; own terms of service and
                    privacy policies.
                </p>

                <h2 className="text-xl font-bold mt-8">5. Accounts</h2>
                <p>
                    Some KumoLab features (such as the admin dashboard) require an account.
                    You are responsible for maintaining the confidentiality of your credentials
                    and for any activity that occurs under your account.
                </p>

                <h2 className="text-xl font-bold mt-8">6. Disclaimer of Warranties</h2>
                <p>
                    The Service is provided &quot;as is&quot; and &quot;as available&quot;
                    without warranties of any kind, express or implied. KumoLab does not
                    guarantee that the Service will be uninterrupted, timely, or error-free, or
                    that all anime news surfaced by the Service is complete or accurate.
                </p>

                <h2 className="text-xl font-bold mt-8">7. Limitation of Liability</h2>
                <p>
                    To the maximum extent permitted by law, KumoLab will not be liable for any
                    indirect, incidental, special, consequential, or punitive damages, or any
                    loss of profits or revenues, arising out of or in connection with your use
                    of the Service.
                </p>

                <h2 className="text-xl font-bold mt-8">8. Changes to These Terms</h2>
                <p>
                    We may update these Terms from time to time. The updated version will be
                    indicated by a new &quot;Last updated&quot; date. Continued use of the
                    Service after changes constitutes acceptance of the revised Terms.
                </p>

                <h2 className="text-xl font-bold mt-8">9. Governing Law</h2>
                <p>
                    These Terms are governed by the laws of the United States, without regard
                    to conflict-of-laws principles.
                </p>

                <h2 className="text-xl font-bold mt-8">10. Contact</h2>
                <p>
                    Questions about these Terms? Email{' '}
                    <a href="mailto:kumolabanime@gmail.com" className="underline">
                        kumolabanime@gmail.com
                    </a>
                    .
                </p>
            </section>
        </main>
    );
}
