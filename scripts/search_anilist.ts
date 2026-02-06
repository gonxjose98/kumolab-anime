
import fetch from 'node-fetch';

async function searchAniList() {
    const query = `
    query ($search: String) {
        Media (search: $search, type: ANIME) {
            id
            title {
                romaji
                english
                native
            }
            coverImage {
                extraLarge
                large
            }
            bannerImage
        }
    }
    `;

    const variables = {
        search: "Pokemon Horizons Rayquaza"
    };

    const url = 'https://graphql.anilist.co';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            query: query,
            variables: variables
        })
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(error);
    }
}

searchAniList();
