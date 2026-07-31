/**
 * resolve-tiers.mjs — one-off: propose anime_tiers rows from AniList.
 *
 * Takes a candidate list (recent feed subjects + evergreen franchises), asks
 * AniList for each one's id / canonical title / popularity / studio, and prints
 * proposed tier rows. Read-only: it writes nothing, it just prints JSON.
 */

const ANILIST = 'https://graphql.anilist.co';

const FEED = [
    'Snowball Earth', 'Saga of Tanya the Evil', 'Reiwa no Dara-san',
    'Classroom of the Elite', 'Dorohedoro', 'Though I Am an Inept Villainess',
    'Welcome to Demon School! Iruma-kun', 'Awashima Hyakkei', 'Rooster Fighter',
    'Wistoria: Wand and Sword', 'Blue Lock', 'Jujutsu Kaisen',
    'Mushoku Tensei', 'Re:Zero', 'You and I Are Polar Opposites',
    'Fate/Grand Order', 'Black Torch', 'Chainsaw Man', 'Clevatess',
    'Cyborg 009', 'Dr. Stone', 'Eleceed', 'Fate/strange fake', 'Fool Night',
    'In the Clear Moonlit Dusk', 'Marvel Tokon', 'My Hero Academia',
    'Puella Magi Madoka Magica', 'Rent-a-Girlfriend', 'Sasaki and Peeps',
    'Skeleton Knight in Another World', 'Sword Art Online',
    'That Time I Got Reincarnated as a Slime', 'The Detective Is Already Dead',
    'Thunder 3', 'Tomb Raider King', 'Virtua Fighter', 'KonoSuba',
    'Grand Blue Dreaming', 'One Piece', 'The Apothecary Diaries',
    'Witch Hat Atelier', 'Ghost in the Shell', 'Bleach',
    'BanG Dream! Ave Mujica', 'Be Forever Yamato', 'The Ribbon Hero',
];

const EVERGREEN = [
    'Naruto', 'Boruto', 'Dragon Ball', 'Demon Slayer', 'Attack on Titan',
    'Spy x Family', 'Frieren', 'Solo Leveling', 'Tokyo Revengers',
    'Hunter x Hunter', 'Death Note', 'Fullmetal Alchemist: Brotherhood',
    'Overlord', 'Mob Psycho 100', 'One Punch Man', 'Haikyuu!!',
    'Kaiju No. 8', 'Oshi no Ko', 'Dandadan', 'Wind Breaker', 'Fire Force',
    'Black Clover', 'Vinland Saga', 'Made in Abyss', 'Horimiya',
    'Sakamoto Days', 'Gachiakuta', 'Fate/stay night', 'Mobile Suit Gundam',
    'Neon Genesis Evangelion', 'Sailor Moon', 'Pokemon', 'Yu-Gi-Oh!',
    'Digimon', 'Cardcaptor Sakura', 'Steins;Gate', 'Code Geass',
    'Your Lie in April', 'Clannad', 'Violet Evergarden', 'A Silent Voice',
    'Weathering With You', 'Suzume', 'Kimi no Na wa', 'Lupin III',
    'Detective Conan', 'Slam Dunk', 'Initial D', "JoJo's Bizarre Adventure",
    'Berserk', 'Hellsing', 'Trigun', 'Cowboy Bebop', 'Monster', 'Parasyte',
    'Tokyo Ghoul', 'Noragami', 'The Seven Deadly Sins', 'Fairy Tail',
    'Zom 100', 'Undead Unluck', 'Ranma 1/2', 'Inuyasha', 'Yu Yu Hakusho',
    'Love Live!', 'The Idolmaster', 'Uma Musume', 'Danmachi',
    'No Game No Life', 'The Eminence in Shadow', 'Shangri-La Frontier',
    'Bocchi the Rock!', 'Lycoris Recoil', 'Cyberpunk: Edgerunners',
    'Delicious in Dungeon', 'Ascendance of a Bookworm',
    'The Rising of the Shield Hero', 'Goblin Slayer', 'Blue Exorcist',
    'Assassination Classroom', 'The Promised Neverland', 'Dr. Slump',
    'Kaguya-sama: Love is War', 'Rascal Does Not Dream of Bunny Girl Senpai',
    'Konosuba', 'Given', 'Free!', 'Yuri!!! on Ice', 'Beastars',
    'Jobless Reincarnation', 'Toilet-bound Hanako-kun', 'Bungo Stray Dogs',
    'Akira', 'Ghibli', 'Spirited Away', 'Princess Mononoke', 'Howl\'s Moving Castle',
];

const QUERY = `query ($q: String) {
  Media(search: $q, type: ANIME, sort: [POPULARITY_DESC]) {
    id
    title { romaji english }
    popularity
    format
    studios(isMain: true) { nodes { name } }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function look(q) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(ANILIST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: QUERY, variables: { q } }),
        });
        if (res.status === 429) { await sleep(60_000); continue; }
        if (!res.ok) return null;
        const j = await res.json();
        return j?.data?.Media ?? null;
    }
    return null;
}

// Bands mirror scoring.ts POPULARITY_BANDS so the tiers and the AniList
// fallback rank the same franchise the same way.
function tierFor(pop) {
    if (pop >= 200_000) return 1;
    if (pop >= 80_000) return 2;
    if (pop >= 25_000) return 3;
    return null; // too small to be worth a tier slot
}

const seen = new Set();
const out = [];
const misses = [];
const all = [...FEED, ...EVERGREEN];

for (let i = 0; i < all.length; i++) {
    const name = all[i];
    const m = await look(name);
    await sleep(750); // AniList allows 90/min; stay well under
    if (!m || typeof m.popularity !== 'number') { misses.push(name); continue; }
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const tier = tierFor(m.popularity);
    const row = {
        query: name,
        anilist_id: m.id,
        anime: m.title?.english || m.title?.romaji,
        romaji: m.title?.romaji,
        popularity: m.popularity,
        studio: m.studios?.nodes?.[0]?.name ?? null,
        format: m.format,
        tier,
    };
    if (tier) out.push(row); else misses.push(`${name} (pop ${m.popularity}, too small)`);
    process.stderr.write(`${i + 1}/${all.length} ${name} -> ${row.anime} pop=${m.popularity} tier=${tier}\n`);
}

out.sort((a, b) => b.popularity - a.popularity);
console.log(JSON.stringify({ proposed: out, misses }, null, 2));
