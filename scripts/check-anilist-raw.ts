
const ANILIST_URL = 'https://graphql.anilist.co';

async function query() {
    const start = Math.floor(new Date('2026-01-16T05:00:00Z').getTime() / 1000);
    const end = Math.floor(new Date('2026-01-17T04:59:59Z').getTime() / 1000);

    const q = `
        query ($start: Int, $end: Int) {
            Page {
                airingSchedules(airingAt_greater: $start, airingAt_lesser: $end) {
                    episode
                    airingAt
                    media {
                        id
                        title { english romaji }
                        status
                        format
                        popularity
                        externalLinks { site url }
                    }
                }
            }
        }
    `;

    const response = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, variables: { start, end } })
    });
    const json = await response.json();
    const schedules = json.data.Page.airingSchedules;

    console.log(`--- RAW ANALYTICS ---`);
    schedules.forEach(s => {
        const title = s.media.title.english || s.media.title.romaji;
        const sites = s.media.externalLinks.map(l => l.site).join(', ');
        console.log(`TITLE: ${title}`);
        console.log(`STATUS: ${s.media.status} | FORMAT: ${s.media.format} | POPULARITY: ${s.media.popularity}`);
        console.log(`SITES: ${sites}`);
        console.log(`EPISODE: ${s.episode} | AT: ${new Date(s.airingAt * 1000).toISOString()}`);
        console.log('---');
    });
}

query().catch(console.error);
