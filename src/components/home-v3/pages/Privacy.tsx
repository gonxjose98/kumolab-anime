import PageShell from '../PageShell';
import p from '../Pages.module.css';

const TOC = [
    { id: 'information-we-collect', label: '1. Information We Collect' },
    { id: 'how-we-use-information', label: '2. How We Use Information' },
    { id: 'cookies', label: '3. Cookies' },
    { id: 'third-party-services', label: '4. Third-Party Services' },
    { id: 'sharing-of-information', label: '5. Sharing of Information' },
    { id: 'data-retention', label: '6. Data Retention' },
    { id: 'your-rights', label: '7. Your Rights' },
    { id: 'children', label: '8. Children' },
    { id: 'changes-to-this-policy', label: '9. Changes to This Policy' },
    { id: 'contact', label: '10. Contact' },
];

/** Privacy Policy: copy carried over verbatim from the previous page; only the layout is new. */
export default function PrivacyPage() {
    return (
        <PageShell title="Privacy Policy" sub="How we handle your information, in plain terms.">
            <div className={p.wrap}>
                <div className={p.legal}>
                    <aside className={p.toc} aria-label="Contents">
                        <p className={p.tocTitle}>On this page</p>
                        <ol>
                            {TOC.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.label}</a></li>)}
                        </ol>
                        <p className={p.updated}>Last updated: 2026-05-04</p>
                    </aside>
                    <article className={p.doc}>
                    <p>
                        This Privacy Policy explains how KumoLab (&quot;KumoLab&quot;,
                        &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, uses, and
                        protects information when you visit kumolabanime.com or interact with any
                        KumoLab service (the &quot;Service&quot;).
                    </p>

                    <h2 id="information-we-collect">1. Information We Collect</h2>
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

                    <h2 id="how-we-use-information">2. How We Use Information</h2>
                    <p>
                        We use information to (a) operate and maintain the Service, (b) improve
                        KumoLab&apos;s editorial coverage and recommendations, (c) communicate with
                        you when you reach out to us, and (d) detect and prevent abuse.
                    </p>

                    <h2 id="cookies">3. Cookies</h2>
                    <p>
                        The Service uses essential cookies to keep admin sessions signed in and to
                        remember basic UI preferences. We do not use advertising cookies or sell
                        your data to advertisers.
                    </p>

                    <h2 id="third-party-services">4. Third-Party Services</h2>
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

                    <h2 id="sharing-of-information">5. Sharing of Information</h2>
                    <p>
                        We do not sell your personal information. We may share information (a) with
                        service providers who help us operate the Service, (b) when required by
                        law, and (c) if KumoLab is involved in a merger, acquisition, or sale of
                        assets.
                    </p>

                    <h2 id="data-retention">6. Data Retention</h2>
                    <p>
                        Server logs are retained for up to 90 days. Editorial post records are
                        retained for as long as the post is published; expired posts are deleted on
                        a daily cleanup schedule. Communications you send us are retained for as
                        long as needed to handle your request.
                    </p>

                    <h2 id="your-rights">7. Your Rights</h2>
                    <p>
                        Depending on where you live, you may have rights to access, correct,
                        delete, or restrict the processing of your personal information. To
                        exercise any of these rights, email us at the address below.
                    </p>

                    <h2 id="children">8. Children</h2>
                    <p>
                        KumoLab is not directed to children under 13 and we do not knowingly
                        collect personal information from anyone under 13. If you believe we have
                        received such information, please contact us so we can delete it.
                    </p>

                    <h2 id="changes-to-this-policy">9. Changes to This Policy</h2>
                    <p>
                        We may update this Policy from time to time. The updated version will be
                        indicated by a new &quot;Last updated&quot; date.
                    </p>

                    <h2 id="contact">10. Contact</h2>
                    <p>
                        Questions about this Privacy Policy? Email{' '}
                        <a href="mailto:kumolabanime@gmail.com">kumolabanime@gmail.com</a>.
                    </p>
                </article>
                </div>
            </div>
        </PageShell>
    );
}
