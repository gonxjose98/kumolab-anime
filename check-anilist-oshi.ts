
import fetch from 'node-fetch';

async function checkAniList() {
    const query = `
        query ($search: String) {
            Page(page: 1, perPage: 10) {
                media(search: $search, type: ANIME) {
                    id
                    title {
                        romaji
                        english
                    }
                    status
                    seasonYear
                    episodes
                }
            }
        }
    `;
    const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { search: "OSHI NO KO" } })
    });
    const json = await res.json();
    console.log(JSON.stringify(json.data.Page.media, null, 2));
}

checkAniList();
