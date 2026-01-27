
async function run() {
    const query = `
        query ($search: String) {
            Media (search: $search, type: ANIME) {
                title {
                    english
                    romaji
                }
                bannerImage
                coverImage {
                    extraLarge
                }
            }
        }
    `;
    const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { search: 'Reborn as a Vending Machine' } })
    });
    const json = await response.json();
    console.log(JSON.stringify(json.data.Media, null, 2));
}
run();
