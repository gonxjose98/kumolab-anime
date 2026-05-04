import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy · KumoLab',
    description: "KumoLab's Privacy Policy.",
};

export default function PrivacyPage() {
    return (
        <main className="max-w-3xl mx-auto px-5 py-12 text-[var(--text-primary)]" style={{ lineHeight: 1.7 }}>
            <h1 className="text-3xl md:text-4xl font-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Privacy Policy
            </h1>
            <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
                Last updated: 2026-05-04
            </p>

            <section className="space-y-6 text-[15px]">
                <p>
                    This Privacy Policy explains how KumoLab (&quot;KumoLab&quot;,
                    &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, uses, and
                    protects information when you visit kumolabanime.com or interact with any
                    KumoLab service (the &quot;Service&quot;).
                </p>

                <h2 className="text-xl font-bold mt-8">1. Information We Collect</h2>
                <p>
                    <strong>Information you provide.</strong> If you contact us by email, sign
                    in to the admin dashboard, or otherwise interact with us directly, we may
                    receive your name, email address, and any other information you choose to
                    share.
                </p>
                <p>
                    <strong>Automatically collected.</strong> We collect standard server logs
                    (IP address, user agent, timestamps, requested URLs) and aggregated
                    analytics about how visitors use the site (pages viewed, time on page,
                    referrer). We do not use these to track you across other sites.
                </p>

                <h2 className="text-xl font-bold mt-8">2. How We Use Information</h2>
                <p>
                    We use information to (a) operate and maintain the Service, (b) improve
                    KumoLab&apos;s editorial coverage and recommendations, (c) communicate with
                    you when you reach out to us, and (d) detect and prevent abuse.
                </p>

                <h2 className="text-xl font-bold mt-8">3. Cookies</h2>
                <p>
                    The Service uses essential cookies to keep admin sessions signed in and to
                    remember basic UI preferences. We do not use advertising cookies or sell
                    your data to advertisers.
                </p>

                <h2 className="text-xl font-bold mt-8">4. Third-Party Services</h2>
                <p>
                    KumoLab integrates with third-party platforms to publish content and
                    surface news. These include Instagram, TikTok, YouTube, Facebook, Threads,
                    AniList, Crunchyroll, and Anime News Network. When KumoLab publishes
                    content to a third-party platform, that platform&apos;s own privacy policy
                    governs information they collect from you on their service.
                </p>
                <p>
                    Hosting and infrastructure: kumolabanime.com is served by Vercel and uses
                    Supabase for storage. Both providers process server-side request data on
                    our behalf.
                </p>

                <h2 className="text-xl font-bold mt-8">5. Sharing of Information</h2>
                <p>
                    We do not sell your personal information. We may share information (a) with
                    service providers who help us operate the Service, (b) when required by
                    law, and (c) if KumoLab is involved in a merger, acquisition, or sale of
                    assets.
                </p>

                <h2 className="text-xl font-bold mt-8">6. Data Retention</h2>
                <p>
                    Server logs are retained for up to 90 days. Editorial post records are
                    retained for as long as the post is published; expired posts are deleted on
                    a daily cleanup schedule. Communications you send us are retained for as
                    long as needed to handle your request.
                </p>

                <h2 className="text-xl font-bold mt-8">7. Your Rights</h2>
                <p>
                    Depending on where you live, you may have rights to access, correct,
                    delete, or restrict the processing of your personal information. To
                    exercise any of these rights, email us at the address below.
                </p>

                <h2 className="text-xl font-bold mt-8">8. Children</h2>
                <p>
                    KumoLab is not directed to children under 13 and we do not knowingly
                    collect personal information from anyone under 13. If you believe we have
                    received such information, please contact us so we can delete it.
                </p>

                <h2 className="text-xl font-bold mt-8">9. Changes to This Policy</h2>
                <p>
                    We may update this Policy from time to time. The updated version will be
                    indicated by a new &quot;Last updated&quot; date.
                </p>

                <h2 className="text-xl font-bold mt-8">10. Contact</h2>
                <p>
                    Questions about this Privacy Policy? Email{' '}
                    <a href="mailto:kumolabanime@gmail.com" className="underline">
                        kumolabanime@gmail.com
                    </a>
                    .
                </p>
            </section>
        </main>
    );
}
