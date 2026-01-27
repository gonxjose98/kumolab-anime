
import { fetchAniListAiring } from '../src/lib/engine/fetchers';
import { generateDailyDropsPost } from '../src/lib/engine/generator';

async function main() {
    console.log("Running Debug Daily Drops...");

    const now = new Date(); // Local system time (which usually matches User's environment or verification context)
    // But we want to simulate EST behavior as per engine.ts
    // In node, typically timezone is UTC or system.

    console.log("System Time:", now.toString());

    // Replicate engine.ts logic
    const getESTBoundaries = (date: Date) => {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const parts = formatter.formatToParts(date);
        const find = (type: string) => parts.find(p => p.type === type)?.value || '';

        const m = find('month');
        const d = find('day');
        const y = find('year');

        console.log(`Debug Date Parts: Y=${y} M=${m} D=${d}`);

        // Create UTC dates representing the start and end of that EST day
        const start = new Date(`${y}-${m}-${d}T00:00:00-05:00`);
        const end = new Date(`${y}-${m}-${d}T23:59:59-05:00`);

        return { start, end };
    };

    const { start: startLimit, end: endLimit } = getESTBoundaries(now);
    console.log(`[Engine] Filtering airing from ${startLimit.toISOString()} to ${endLimit.toISOString()} (EST Window)`);
    // Unix timestamps
    const startUnix = Math.floor(startLimit.getTime() / 1000);
    const endUnix = Math.floor(endLimit.getTime() / 1000);

    console.log(`Unix: ${startUnix} to ${endUnix}`);

    try {
        const episodes = await fetchAniListAiring(startUnix, endUnix);
        console.log(`Fetched ${episodes.length} episodes.`);

        if (episodes.length > 0) {
            episodes.forEach(ep => {
                console.log(`- ${ep.media.title.english || ep.media.title.romaji} (Ep ${ep.episode})`);
            });

            const post = generateDailyDropsPost(episodes, now);
            console.log("Generated Post:", post ? "Yes" : "No");
            if (post) {
                console.log("Title:", post.title);
                console.log("Content Preview:", post.content.substring(0, 100));
            }
        } else {
            console.log("NO EPISODES FOUND. This implies specific filtering issues or actually no anime today.");
        }

    } catch (error) {
        console.error("Error fetching:", error);
    }
}

main();
