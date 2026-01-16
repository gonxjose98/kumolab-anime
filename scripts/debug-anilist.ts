
const ANILIST_URL = 'https://graphql.anilist.co';

async function query() {
    const q = `
        query ($search: String) {
            Media (search: $search, type: ANIME) {
                id
                title { english romaji }
                status
                format
                season
                seasonYear
                airingSchedules(perPage: 5) {
                    nodes {
                        episode
                        airingAt
                    }
                }
            }
        }
    `;

    const titles = ["Cat's Eye (2025)", "Fire Force Season 3 Part 2", "Frieren: Beyond Journey’s End Season 2"];

    for (const title of titles) {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, variables: { search: title } })
        });
        const json = await response.json();
        console.log(`--- ${title} ---`);
        console.log(JSON.stringify(json.data.Media, null, 2));
    }
}

query().catch(console.error);
