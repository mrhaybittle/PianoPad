// js/dailyChallenge.js
import { initAudio, audioCtx } from './audio.js';
import { APPS_SCRIPT_URL } from './config.js';

// ============================================================================
// DAILY MERIT AWARD CHALLENGE LIST (55 TOTAL)
// Edit numbers, icons, descriptions, or delete any challenge object below.
// ============================================================================
export const DAILY_CHALLENGES = [
    // ------------------------------------------------------------------------
    // GENERAL SKILL & EXPLORATION CHALLENGES (1 - 21)
    // ------------------------------------------------------------------------

    // 1. Play any song in Game Mode 20 times in a single day.
    {
        id: 'play_game_20',
        icon: '🏃',
        title: 'Game Mode Marathon',
        description: 'Play through a piece in Game Mode 20 times today.',
        tier: 'Silver',
        target: 20,
        unit: 'plays'
    },

    // 2. Score over 90% accuracy on 5 different songs (at 100% speed or faster) in one day.
    {
        id: 'master_5_90',
        icon: '👑',
        title: 'The Penta-Master',
        description: 'Master 5 different songs with over 90% accuracy (at 100%+ speed).',
        tier: 'Gold',
        target: 5,
        unit: 'songs'
    },

    // 3. Record 0 tab switches (Breaks: 0) for at least 20 continuous minutes.
    {
        id: 'no_tabs_20m',
        icon: '🔒',
        title: 'Locked In (20 Mins)',
        description: 'Record 0 tab switches for at least 20 minutes of your session.',
        tier: 'Silver',
        target: 20,
        unit: 'mins'
    },

    // 4. Record 0 tab switches (Breaks: 0) for at least 35 continuous minutes.
    {
        id: 'no_tabs_35m',
        icon: '🛡️',
        title: 'Ironclad Focus',
        description: 'Record 0 tab switches for 35 minutes of your session.',
        tier: 'Gold',
        target: 35,
        unit: 'mins'
    },

    // 5. Achieve a 100% accuracy score on any song at 100% speed or faster.
    {
        id: 'perfect_100',
        icon: '💎',
        title: 'Flawless Victory',
        description: 'Score 100% accuracy on any song in Game Mode (at 100%+ speed).',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 6. Hit 35 Perfect notes in a row without any Early/Late or Missed notes.
    {
        id: 'streak_35',
        icon: '🔥',
        title: 'Unstoppable Streak',
        description: 'Hit a streak of 35 Perfect notes in a row without an error.',
        tier: 'Silver',
        target: 35,
        unit: 'notes'
    },

    // 7. Hit 60 Perfect notes in a row without any Early/Late or Missed notes.
    {
        id: 'streak_60',
        icon: '⚡',
        title: 'Virtuoso Streak',
        description: 'Hit a streak of 60 Perfect notes in a row without an error.',
        tier: 'Gold',
        target: 60,
        unit: 'notes'
    },

    // 8. Finish any Medium or Hard song with 0 Missed notes (Early/Late hits allowed).
    {
        id: 'zero_misses_med_hard',
        icon: '🎯',
        title: 'Zero Misses',
        description: 'Complete a Medium or Hard song with 0 Missed notes (at 100%+ speed).',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 9. Score 85% or higher on a Hard (Red) difficulty song at 100% speed or faster.
    {
        id: 'hard_song_85',
        icon: '🌶️',
        title: 'Red-Label Conqueror',
        description: 'Score at least 85% accuracy on a Hard (Red) song at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 10. Complete any song at 130% speed or faster with at least 85% accuracy.
    {
        id: 'turbo_130',
        icon: '🏎️',
        title: 'Turbo Fingers',
        description: 'Complete any song at 130% speed (or faster) with at least 85% accuracy.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 11. Complete an Easy (Green) song at 160% speed or faster with at least 80% accuracy.
    {
        id: 'hyper_easy_160',
        icon: '🚀',
        title: 'Hyper-Speed Green',
        description: 'Play an Easy (Green) song at 160% speed (or faster) with 80%+ accuracy.',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 12. Score 85% or higher 3 times in a row on the exact same song.
    {
        id: 'hat_trick_85',
        icon: '🎩',
        title: 'Hat-Trick Consistency',
        description: 'Score 85% or higher 3 times in a row on the same song (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'in a row'
    },

    // 13. Accumulate 300 total Perfect note hits across songs today.
    {
        id: 'total_perfect_300',
        icon: '🥉',
        title: '300 Perfect Club',
        description: 'Land 300 total Perfect hits across any songs today.',
        tier: 'Bronze',
        target: 300,
        unit: 'hits'
    },

    // 14. Accumulate 600 total Perfect note hits across songs today.
    {
        id: 'total_perfect_600',
        icon: '🥇',
        title: '600 Perfect Club',
        description: 'Land 600 total Perfect hits across any songs today.',
        tier: 'Gold',
        target: 600,
        unit: 'hits'
    },

    // 15. Turn Sheet Music OFF and score over 90% on a Medium or Hard song.
    {
        id: 'waterfall_only_90',
        icon: '🙈',
        title: 'Waterfall Only',
        description: 'Toggle Sheet: OFF and score 90%+ on a Medium or Hard song (100%+ speed).',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 16. Complete 3 songs in Game Mode using 3 different visual themes (Dark, Neon, Retro, etc.).
    {
        id: 'theme_explorer_3',
        icon: '🎨',
        title: 'Style Explorer',
        description: 'Complete 3 songs in Game Mode using 3 different visual themes.',
        tier: 'Bronze',
        target: 3,
        unit: 'themes'
    },

    // 17. Complete 3 songs in Game Mode using 3 different instrument sounds.
    {
        id: 'instrument_explorer_3',
        icon: '🎺',
        title: 'Sound Explorer',
        description: 'Complete 3 songs in Game Mode using 3 different instruments.',
        tier: 'Bronze',
        target: 3,
        unit: 'instruments'
    },

    // 18. Record an original melody of at least 16 notes using the Record button.
    {
        id: 'composer_16_notes',
        icon: '🎼',
        title: 'Original Composer',
        description: 'Use Record to capture an original melody of at least 16 notes.',
        tier: 'Bronze',
        target: 1,
        unit: 'recording'
    },

    // 19. Turn on Loop Mode at 80% speed (or slower) and let it auto-accelerate past 100%.
    {
        id: 'loop_climber',
        icon: '🧗',
        title: 'The Loop Climber',
        description: 'Start Loop Mode at 80% speed (or slower) and let it auto-climb past 100%.',
        tier: 'Silver',
        target: 1,
        unit: 'climb'
    },

    // 20. Finish practicing a song in Step Mode, then score 80%+ on that same song in Game Mode.
    {
        id: 'step_to_game_80',
        icon: '🪜',
        title: 'Step-by-Step Mastery',
        description: 'Finish a song in Step Mode, then score 80%+ on that same song in Game Mode.',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 21. Master 3 different Medium (Orange) songs with at least 85% accuracy.
    {
        id: 'master_3_medium',
        icon: '🍊',
        title: 'Orange-Label Trio',
        description: 'Master 3 different Medium (Orange) songs with 85%+ accuracy (100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs'
    },

    // ------------------------------------------------------------------------
    // SINGLE-SONG BOSS & ENDURANCE CHALLENGES (22 - 38)
    // ------------------------------------------------------------------------

    // 22. Score 80%+ on the ultra-fast "Through the Fire & Flames - Piano Intro" (Hard).
    {
        id: 'boss_fire_flames',
        icon: '🐉',
        title: 'Through the Fire & Fingers',
        description: 'Score 80%+ on "Through the Fire & Flames - Piano Intro" at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 23. Complete "Flight of the Bumblebee" (Hard) at 110%+ speed with 85%+ accuracy.
    {
        id: 'boss_bumblebee',
        icon: '🐝',
        title: 'Flight of the Speedster',
        description: 'Complete "Flight of the Bumblebee" at 110%+ speed with 85%+ accuracy.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 24. Play "Mission: Impossible Theme" (Hard) with Sheet Music turned OFF and score 85%+.
    {
        id: 'boss_mission_impossible',
        icon: '🕶️',
        title: 'The Impossible Mission',
        description: 'Toggle Sheet Music: OFF and score 85%+ on "Mission: Impossible Theme" at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 25. Score 90%+ on the 112-note thrash metal riff "Master of Puppets (recorded by JC)" (Hard).
    {
        id: 'boss_master_puppets',
        icon: '🤘',
        title: 'Master of the Keys',
        description: 'Score 90%+ on "Master of Puppets (recorded by JC)" at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 26. Finish "Megalovania (from Undertale)" (Hard) with 0 Missed notes at 100%+ speed.
    {
        id: 'boss_megalovania',
        icon: '💀',
        title: 'Megalomaniac',
        description: 'Finish "Megalovania (from Undertale)" with 0 Missed notes at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 27. Score 85%+ on "Sandstorm - by Darude" (Hard) at 115%+ speed.
    {
        id: 'boss_sandstorm',
        icon: '🌪️',
        title: 'Darude Sandstorm Sprint',
        description: 'Score 85%+ on "Sandstorm - by Darude" at 115%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 28. Complete the 1,145-note endurance marathon "Moonlight Sonata" (Hard) with 85%+ accuracy.
    {
        id: 'boss_moonlight',
        icon: '🌙',
        title: 'Moonlight Virtuoso',
        description: 'Score 85%+ on "Moonlight Sonata" at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 29. Score 85%+ on the 193-note rapid alternation piece "Thunderstruck Guitar Intro" (Hard).
    {
        id: 'boss_thunderstruck',
        icon: '⛈️',
        title: 'Struck by Lightning',
        description: 'Score 85%+ on "Thunderstruck Guitar Intro" at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 30. Complete the 800-note contemporary classical piece "River Flows in You - Yiruma" (Hard) with 80%+ accuracy.
    {
        id: 'boss_river_flows',
        icon: '🌊',
        title: 'River of 800 Notes',
        description: 'Complete "River Flows in You - Yiruma" with 80%+ accuracy at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 31. Score 85%+ on both "secretly Hard" nursery rhymes: Old MacDonald Had A Farm & The Wheels On the Bus.
    {
        id: 'boss_deceptively_hard',
        icon: '🚜',
        title: 'Deceptively Hard',
        description: 'Score 85%+ on both "Old MacDonald Had A Farm" and "The Wheels On the Bus" at 100%+ speed.',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Old MacDonald Had A Farm',
            'The Wheels On the Bus'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 32. Play "The Sorcerer's Apprentice" (Hard) with Sheet Music turned OFF and score 85%+.
    {
        id: 'boss_sorcerer',
        icon: '🧙',
        title: 'Sorcerer’s Final Exam',
        description: 'Toggle Sheet Music: OFF and score 85%+ on "The Sorcerer\'s Apprentice" at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 33. Finish Bach's "Toccata and Fugue in D minor, BWV 565" (Hard) with 0 Missed notes at 100%+ speed.
    {
        id: 'boss_toccata',
        icon: '🧛',
        title: 'Phantom of the Organ',
        description: 'Finish "Toccata and Fugue in D minor, BWV 565" with 0 Missed notes at 100%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 34. Score 85%+ on "Thousand Miles - by Vanessa Carlton" (Hard) at 110%+ speed.
    {
        id: 'boss_thousand_miles',
        icon: '👟',
        title: 'The Thousand-Mile Sprint',
        description: 'Score 85%+ on "Thousand Miles - by Vanessa Carlton" at 110%+ speed.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 35. Complete the 92-note surf rock classic "Wipeout" (Hard) at 115%+ speed with 80%+ accuracy.
    {
        id: 'boss_wipeout',
        icon: '🏄',
        title: 'Wipeout Wave Rider',
        description: 'Complete "Wipeout" at 115%+ speed with 80%+ accuracy.',
        tier: 'Gold',
        target: 1,
        unit: 'song'
    },

    // 36. Score 90%+ accuracy 3 times in a row on "Never Gonna Give You Up" (Medium) at 100%+ speed.
    {
        id: 'boss_rickroll',
        icon: '🕺',
        title: 'Never Gonna Give Up',
        description: 'Score 90%+ accuracy 3 times in a row on "Never Gonna Give You Up" at 100%+ speed.',
        tier: 'Silver',
        target: 3,
        unit: 'in a row'
    },

    // 37. Complete "Espresso" (Medium) at a caffeinated 140%+ speed with 90%+ accuracy.
    {
        id: 'boss_espresso',
        icon: '☕',
        title: 'Barista Double-Shot',
        description: 'Complete "Espresso" at 140%+ speed with 90%+ accuracy.',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // 38. Score 95%+ accuracy on the classroom pack-up song "Stand Up (Put Your Chair Away Or There You'll Stay)" (Medium).
    {
        id: 'boss_stand_up',
        icon: '🪑',
        title: 'Chair-Stacking Finale',
        description: 'Score 95%+ accuracy on "Stand Up (Put Your Chair Away Or There You\'ll Stay)" at 100%+ speed.',
        tier: 'Silver',
        target: 1,
        unit: 'song'
    },

    // ------------------------------------------------------------------------
    // MULTI-SONG SETLIST CHALLENGES (39 - 55)
    // ------------------------------------------------------------------------

    // 39. Score 85%+ on any 2 Classical setlist pieces at 100%+ speed.
    {
        id: 'setlist_classical',
        icon: '🎻',
        title: 'Classical Virtuoso',
        description: 'Score 85%+ on 2 Classical setlist pieces (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Moonlight Sonata',
            'Toccata and Fugue in D minor, BWV 565',
            'Hungarian Dance No. 5',
            'Symphony #40 K550',
            'Fur Elise'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 40. Master any 3 Video Game themes from the setlist with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_games',
        icon: '👾',
        title: '8-Bit Boss Rush',
        description: 'Master 3 Video Game themes with 85%+ accuracy (at 100%+ speed).',
        tier: 'Gold',
        target: 3,
        unit: 'songs',
        songs: [
            'Megalovania (from Undertale)',
            'Tetris - by (AT)',
            'Super Mario Theme',
            'Plants vs Zombies Theme',
            'Fortnite Theme'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 41. Complete any 3 Movie Themes from the setlist at 100%+ speed with 90%+ accuracy.
    {
        id: 'setlist_movies',
        icon: '🎬',
        title: 'Cinema Blockbuster',
        description: 'Complete 3 Movie Themes at 100%+ speed with 90%+ accuracy.',
        tier: 'Silver',
        target: 3,
        unit: 'songs',
        songs: [
            'Pirates of the Caribbean',
            'Star Wars',
            'Imperial March Theme',
            'Harry Potter Theme',
            'Skyfall',
            'Top Gun Theme'
        ],
        minAccuracy: 90,
        minSpeed: 100
    },

    // 42. Score 85%+ on any 2 Hard Rock/Metal riffs from the setlist at 100%+ speed.
    {
        id: 'setlist_hard_rock',
        icon: '🎸',
        title: 'Stadium Rock Legends',
        description: 'Score 85%+ on 2 Hard Rock/Metal riffs (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Sweet Child Of Mine',
            'Thunderstruck Guitar Intro',
            'Crazy Train',
            'Paranoid',
            "Can't Stop - Red Hot Chili Peppers"
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 43. Complete any 2 Spy/Mystery themes with Sheet Music turned OFF at 100%+ speed.
    {
        id: 'setlist_spy',
        icon: '🕵️',
        title: 'Detective & Spy Mode',
        description: 'Complete 2 Spy/Mystery themes with Sheet Music: OFF (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Pink Panther Theme',
            'Mission: Impossible Theme',
            'Get Smart Theme',
            'X Files Theme (Illuminati theme)'
        ],
        minAccuracy: 1,
        minSpeed: 100,
        requireNoSheet: true
    },

    // 44. Master any 2 "Time & Night" themed songs with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_night',
        icon: '🦉',
        title: 'Midnight Marathon',
        description: 'Master 2 "Time & Night" songs with 85%+ accuracy (at 100%+ speed).',
        tier: 'Silver',
        target: 2,
        unit: 'songs',
        songs: [
            '12 to 12 - Sombr',
            'Last Friday Night',
            'In the Night Garden Theme',
            'Clocks - Coldplay',
            'Final Countdown'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 45. Score 85%+ on any 2 Australian classic tracks at 100%+ speed.
    {
        id: 'setlist_aussie',
        icon: '🦘',
        title: 'True Blue Aussie',
        description: 'Score 85%+ on 2 Australian classics (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Bombora - The Atlantics',
            'Friday on My Mind (Chorus Melody)',
            'Never Tear Us Apart',
            'Treaty',
            'Somebody I Used To Know'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 46. Score 85%+ on any 2 Hard pop/dance festival anthems at 100%+ speed.
    {
        id: 'setlist_festival',
        icon: '🎪',
        title: 'Festival Headliner',
        description: 'Score 85%+ on 2 Hard pop/dance anthems (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Paparazzi',
            'Party Rock Anthem',
            'Titanium',
            'Radioactive',
            'Locked Out of Heaven',
            'Dynamite',
            'Happy'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 47. Master any 2 tracks from the 90s Grunge & Hip-Hop setlist with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_90s',
        icon: '📼',
        title: '90s Grunge & Hip-Hop',
        description: 'Master 2 tracks from the 90s setlist with 85%+ accuracy (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Come As You Are - Nirvana',
            'Lose Yourself - riff',
            'Ice Ice Baby/ Under Pressure',
            'The Next Episode - Snoop and Dr. Dre',
            'Push It - by Salt-N-Pepa'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 48. Score 85%+ on any 2 animal-themed tracks at 100%+ speed.
    {
        id: 'setlist_animals',
        icon: '🐾',
        title: 'Four-Legged & Feathered',
        description: 'Score 85%+ on 2 animal-themed tracks (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            'Flight of the Bumblebee',
            "Sascha the Bird's Theme",
            'Three Little Birds',
            'Pink Panther Theme',
            'The Ants Go Marching (Rice House Theme)',
            'Chameleon'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 49. Score 85%+ on any 2 blues, jazz, or post-punk classics at 100%+ speed.
    {
        id: 'setlist_blues',
        icon: '🎷',
        title: 'The Cure for the Blues',
        description: 'Score 85%+ on 2 blues, jazz, or post-punk classics (at 100%+ speed).',
        tier: 'Gold',
        target: 2,
        unit: 'songs',
        songs: [
            "Boys Don't Cry - The Cure",
            'Summertime',
            'Sweet Home Chicago - Main Melody',
            'Fly To Moon',
            'Swing'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 50. Master any 3 synth/80s tracks with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_80s',
        icon: '🕹️',
        title: '80s Synth & Neon',
        description: 'Master 3 synth/80s tracks with 85%+ accuracy (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs',
        songs: [
            'Final Countdown',
            "Boys Don't Cry - The Cure",
            'Take On Me',
            'Just The Way It Is (classic 80s piano)',
            'Blinding Lights - (by JS)'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 51. Complete any 3 hero or villain themes with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_heroes',
        icon: '🦸',
        title: 'Superheroes & Villains',
        description: 'Complete 3 hero or villain themes with 85%+ accuracy (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs',
        songs: [
            'Transformers Theme',
            'Batman Theme (60s TV Show)',
            'Spider-Man Original Theme',
            'Superman Theme',
            'Ironman',
            'Imperial March Theme'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 52. Master any 3 British rock classics with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_british',
        icon: '🇬🇧',
        title: 'British Invasion',
        description: 'Master 3 British rock classics with 85%+ accuracy (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs',
        songs: [
            'Sunshine of Your Love',
            "Can't Buy Me Love",
            'Day Tripper - The Beatles (riff)',
            'Satisfaction - Rolling Stones',
            'Painted Black'
        ],
        minAccuracy: 85,
        minSpeed: 100
    },

    // 53. Score 90%+ on any 3 animated TV themes at 100%+ speed.
    {
        id: 'setlist_cartoons',
        icon: '📺',
        title: 'Saturday Morning Cartoons',
        description: 'Score 90%+ on 3 animated TV themes (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs',
        songs: [
            'Simpsons Theme',
            'Peanuts Theme (Charlie Brown)',
            'Itchy and Scratchy Theme',
            'He-Man (Masters of the Universe)',
            'Mr. Bean Theme (Animated TV Show)'
        ],
        minAccuracy: 90,
        minSpeed: 100
    },

    // 54. Score 90%+ on any 3 modern gaming tracks at 100%+ speed.
    {
        id: 'setlist_modern_games',
        icon: '⛏️',
        title: 'Block-Builder & Battle',
        description: 'Score 90%+ on 3 modern gaming tracks (at 100%+ speed).',
        tier: 'Silver',
        target: 3,
        unit: 'songs',
        songs: [
            'Minecraft - Sweden',
            "Steve's Lava Chicken - from Minecraft",
            'Fortnite Theme',
            'Plants vs Zombies Theme',
            'Tetris Theme'
        ],
        minAccuracy: 90,
        minSpeed: 100
    },

    // 55. Master any 2 holiday or celebration tracks with 85%+ accuracy at 100%+ speed.
    {
        id: 'setlist_celebration',
        icon: '🎉',
        title: 'Holiday & Celebration',
        description: 'Master 2 celebration tracks with 85%+ accuracy (at 100%+ speed).',
        tier: 'Silver',
        target: 2,
        unit: 'songs',
        songs: [
            'Feliz Navidad',
            'Last Christmas',
            'Happy Birthday',
            'Party Up',
            'I Got A Feeling'
        ],
        minAccuracy: 85,
        minSpeed: 100
    }
];

// ============================================================================
// INTERNAL STATE & STORAGE (DAILY PROGRESS + PERMANENT BYOD BADGES)
// ============================================================================
let bridge = null;
let dailyState = null;

export function initDailyChallengeBridge(deps) {
    bridge = deps;
    ensureDailyChallengeUI();
    refreshDailyState();
    updateDailyHudPill();
    renderBadgeTray();
}

function getTodayDateKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getUserSlug() {
    const state = bridge ? bridge.getState() : {};
    return (window.pianoPadUser?.email || state.sessionStudentName || localStorage.getItem('pianopad_name') || 'guest')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
}

// Daily progress key (resets each day)
function getStorageKey() {
    return `pianopad_daily_${getUserSlug()}_${getTodayDateKey()}`;
}

// Permanent BYOD badge key (never resets across days)
function getBadgeStorageKey() {
    return `pianopad_badges_${getUserSlug()}`;
}

export function getEarnedBadges() {
    try {
        const raw = localStorage.getItem(getBadgeStorageKey());
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function awardPermanentBadge(challenge) {
    if (!challenge) return;
    const badges = getEarnedBadges();
    if (!badges.some(b => b.id === challenge.id)) {
        badges.push({
            id: challenge.id,
            title: challenge.title,
            icon: challenge.icon || '🏅',
            tier: challenge.tier || 'Silver',
            description: challenge.description,
            earnedDate: getTodayDateKey()
        });
        try {
            localStorage.setItem(getBadgeStorageKey(), JSON.stringify(badges));
        } catch (e) {
            console.warn('Could not save permanent badge:', e);
        }
    }
    renderBadgeTray();
}

// Retrieves the active challenge for today (or the user's manually selected challenge)
function getTodaysChallenge() {
    if (dailyState && dailyState.challengeId) {
        const found = DAILY_CHALLENGES.find(c => c.id === dailyState.challengeId);
        if (found) return found;
    }

    const dateKey = getTodayDateKey();
    let hash = 0;
    for (let i = 0; i < dateKey.length; i++) {
        hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
    }
    const idx = hash % DAILY_CHALLENGES.length;
    return DAILY_CHALLENGES[idx];
}

function refreshDailyState() {
    const key = getStorageKey();

    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed) {
                dailyState = parsed;
                // Backfill badge if today's challenge was completed before badge tracking was added
                if (dailyState.completed) {
                    const ch = DAILY_CHALLENGES.find(c => c.id === dailyState.challengeId);
                    if (ch) awardPermanentBadge(ch);
                }
                return dailyState;
            }
        }
    } catch (e) {
        console.warn('Could not read daily challenge storage:', e);
    }

    const dateKey = getTodayDateKey();
    let hash = 0;
    for (let i = 0; i < dateKey.length; i++) {
        hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
    }
    const defaultChallenge = DAILY_CHALLENGES[hash % DAILY_CHALLENGES.length];

    dailyState = {
        dateKey: getTodayDateKey(),
        challengeId: defaultChallenge.id,
        accepted: false,
        progress: 0,
        completed: false,
        meta: {
            masteredSongs: [],
            mediumMasteredSongs: [],
            themesUsed: [],
            instrumentsUsed: [],
            lastSongTitle: '',
            consecutive85: 0,
            startedSlowLoop: false,
            stepCompletedSong: ''
        }
    };
    saveDailyState();
    return dailyState;
}

function saveDailyState() {
    if (!dailyState) return;
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(dailyState));
    } catch (e) {
        console.warn('Could not save daily challenge storage:', e);
    }
}

// ============================================================================
// UI INJECTION (MODAL + FOOTER PILL + BADGE TRAY + TROPHY CASE)
// ============================================================================
function ensureDailyChallengeUI() {
    if (!document.getElementById('daily-challenge-styles')) {
        const style = document.createElement('style');
        style.id = 'daily-challenge-styles';
        style.textContent = `
            #daily-challenge-modal {
                z-index: 350;
            }
            .dc-card {
                background: linear-gradient(145deg, #111827 0%, #1e1b4b 55%, #0f172a 100%);
                border: 2px solid #facc15;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(250, 204, 21, 0.25);
                border-radius: 18px;
                max-width: 600px;
                width: 92%;
                max-height: 86vh;
                display: flex;
                flex-direction: column;
                padding: 26px;
                text-align: center;
                color: #f8fafc;
            }
            .dc-tier-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 999px;
                font-size: 0.72rem;
                font-weight: 900;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                margin-bottom: 10px;
            }
            .dc-tier-Bronze { background: linear-gradient(135deg, #b45309, #f59e0b); color: #fff; }
            .dc-tier-Silver { background: linear-gradient(135deg, #64748b, #cbd5e1); color: #0f172a; }
            .dc-tier-Gold   { background: linear-gradient(135deg, #f59e0b, #facc15); color: #0f172a; }
            .dc-progress-track {
                width: 100%;
                height: 14px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 999px;
                overflow: hidden;
                margin: 14px 0 6px 0;
                border: 1px solid rgba(255, 255, 255, 0.15);
            }
            .dc-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #38bdf8, #22c55e);
                transition: width 0.4s ease;
            }
            #daily-challenge-hud-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: #1e1b4b;
                border: 1px solid #facc15;
                color: #facc15;
                font-size: 0.72rem;
                font-weight: 800;
                padding: 4px 10px;
                border-radius: 8px;
                cursor: pointer;
                white-space: nowrap;
                transition: transform 0.15s, background-color 0.2s;
            }
            #daily-challenge-hud-pill:hover {
                transform: translateY(-1px);
                background: #312e81;
            }
            #daily-challenge-hud-pill.dc-done {
                background: #052e16;
                border-color: #22c55e;
                color: #4ade80;
            }

            /* Bottom-Bar Permanent Badge Tray */
            #dc-badge-tray {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                margin-right: 4px;
            }
            .dc-badge-chip {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                border-radius: 50%;
                font-size: 0.85rem;
                background: #0f172a;
                cursor: pointer;
                transition: transform 0.15s ease;
                user-select: none;
            }
            .dc-badge-chip:hover {
                transform: translateY(-2px) scale(1.12);
                z-index: 500;
            }
            .dc-badge-Bronze { border: 1.5px solid #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.35); }
            .dc-badge-Silver { border: 1.5px solid #cbd5e1; box-shadow: 0 0 6px rgba(203, 213, 225, 0.35); }
            .dc-badge-Gold   { border: 1.5px solid #facc15; box-shadow: 0 0 8px rgba(250, 204, 21, 0.55); }

            /* Instant upward-left tooltip so it never clips off the right screen edge */
            .dc-badge-chip::after {
                content: attr(data-tooltip);
                position: absolute;
                bottom: 138%;
                right: 0;
                background: #0f172a;
                color: #f8fafc;
                border: 1px solid #facc15;
                padding: 7px 10px;
                border-radius: 8px;
                font-size: 0.72rem;
                font-weight: 600;
                line-height: 1.35;
                white-space: pre-line;
                width: max-content;
                max-width: 240px;
                text-align: left;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.8);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease;
            }
            .dc-badge-chip:hover::after {
                opacity: 1;
            }

            /* Challenge Selection List */
            #dc-selection-list, #dc-trophy-view {
                display: none;
                flex-direction: column;
                gap: 8px;
                margin-top: 8px;
                overflow: hidden;
            }
            #dc-list-container {
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 400px;
                overflow-y: auto;
                text-align: left;
                padding-right: 8px;
            }
            #dc-list-container::-webkit-scrollbar,
            #dc-trophy-grid::-webkit-scrollbar {
                width: 6px;
            }
            #dc-list-container::-webkit-scrollbar-track,
            #dc-trophy-grid::-webkit-scrollbar-track {
                background: rgba(255,255,255,0.05);
                border-radius: 4px;
            }
            #dc-list-container::-webkit-scrollbar-thumb,
            #dc-trophy-grid::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.2);
                border-radius: 4px;
            }
            .dc-list-item {
                background: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .dc-list-item:hover {
                background: rgba(30, 41, 59, 0.9);
                border-color: #facc15;
            }
            .dc-list-item h4 {
                margin: 0 0 4px 0;
                font-size: 0.95rem;
                color: #f8fafc;
            }
            .dc-list-item p {
                margin: 0;
                font-size: 0.8rem;
                color: #94a3b8;
                line-height: 1.3;
            }
            .dc-song-list {
                margin-top: 6px;
                font-size: 0.75rem;
                color: #38bdf8;
                font-style: italic;
            }

            /* Trophy Case Grid */
            #dc-trophy-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
                gap: 10px;
                max-height: 390px;
                overflow-y: auto;
                padding-right: 6px;
                text-align: center;
            }
            .dc-trophy-card {
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 10px;
                padding: 10px 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
            }
            .dc-trophy-card.earned {
                border-color: #facc15;
                background: linear-gradient(160deg, rgba(30, 27, 75, 0.9), rgba(15, 23, 42, 0.95));
            }
            .dc-trophy-card.locked {
                opacity: 0.42;
                filter: grayscale(100%);
            }
        `;
        document.head.appendChild(style);
    }

    if (!document.getElementById('daily-challenge-modal')) {
        const modal = document.createElement('div');
        modal.id = 'daily-challenge-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="dc-card">
                <div id="dc-main-view">
                    <div style="font-size: 2.6rem; margin-bottom: 4px;" id="dc-icon">🎯</div>
                    <div id="dc-tier-pill" class="dc-tier-badge dc-tier-Gold">DAILY MERIT AWARD CHALLENGE</div>
                    <h2 id="dc-title" style="margin: 0 0 8px 0; font-size: 1.45rem; color: #ffffff;">Today's Challenge</h2>
                    <p id="dc-desc" style="font-size: 0.95rem; color: #cbd5e1; line-height: 1.45; margin: 0 0 12px 0;"></p>
                    <p id="dc-songs-required" style="font-size: 0.8rem; color: #38bdf8; font-style: italic; margin: -4px 0 12px 0; display: none;"></p>

                    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px;">
                        <div style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:700; color:#94a3b8;">
                            <span>PROGRESS</span>
                            <span id="dc-progress-label" style="color:#ffffff;">0 / 1</span>
                        </div>
                        <div class="dc-progress-track">
                            <div class="dc-progress-fill" id="dc-progress-fill" style="width: 0%;"></div>
                        </div>
                        <div style="font-size: 0.75rem; color: #facc15; font-weight: 700; margin-top: 6px;">
                            🎁 Reward: Permanent Merit Badge, 5 Bonus Instruments & Leaderboard Log!
                        </div>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 18px;">
                        <button type="button" id="btn-dc-skip" class="btn-secondary" style="padding: 9px 14px; font-size: 0.85rem;">
                            Skip for Now
                        </button>
                        <button type="button" id="btn-dc-accept" class="btn-success" style="padding: 9px 20px; font-size: 0.92rem; font-weight: 800;">
                            Accept Challenge!
                        </button>
                        <button type="button" id="btn-dc-choose" class="btn-primary" style="display: none; padding: 9px 14px; font-size: 0.85rem;">
                            Choose Another Challenge
                        </button>
                        <button type="button" id="btn-dc-trophies" class="btn-secondary" style="padding: 9px 14px; font-size: 0.85rem; border-color: #facc15; color: #facc15;">
                            🏅 Trophy Case
                        </button>
                    </div>
                </div>

                <div id="dc-selection-list">
                    <h3 style="margin: 0 0 10px 0; color: #facc15; font-size: 1.2rem; text-align: center;">Select a New Challenge</h3>
                    <div id="dc-list-container"></div>
                    <button type="button" id="btn-dc-back" class="btn-secondary" style="margin-top: 12px; padding: 8px;">
                        Back
                    </button>
                </div>

                <div id="dc-trophy-view">
                    <h3 id="dc-trophy-heading" style="margin: 0 0 4px 0; color: #facc15; font-size: 1.2rem; text-align: center;">🏅 Merit Badge Trophy Case</h3>
                    <p style="margin: 0 0 10px 0; font-size: 0.78rem; color: #94a3b8;">Badges stay saved permanently on your device.</p>
                    <div id="dc-trophy-grid"></div>
                    <button type="button" id="btn-dc-trophy-back" class="btn-secondary" style="margin-top: 12px; padding: 8px;">
                        Back
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-dc-skip').addEventListener('click', () => {
            modal.classList.remove('open');
            updateDailyHudPill();
        });

        document.getElementById('btn-dc-accept').addEventListener('click', () => {
            refreshDailyState();
            dailyState.accepted = true;
            saveDailyState();
            modal.classList.remove('open');
            updateDailyHudPill();
            const statusEl = document.getElementById('status');
            if (statusEl) {
                const ch = getTodaysChallenge();
                statusEl.textContent = `🎯 Daily Merit Award Challenge Accepted: ${ch.title} (${dailyState.progress}/${ch.target} ${ch.unit})`;
            }
        });

        document.getElementById('btn-dc-choose').addEventListener('click', () => {
            document.getElementById('dc-main-view').style.display = 'none';
            document.getElementById('dc-trophy-view').style.display = 'none';
            document.getElementById('dc-selection-list').style.display = 'flex';
            populateChallengeList();
        });

        document.getElementById('btn-dc-back').addEventListener('click', () => {
            document.getElementById('dc-selection-list').style.display = 'none';
            document.getElementById('dc-main-view').style.display = 'block';
        });

        document.getElementById('btn-dc-trophies').addEventListener('click', () => {
            openTrophyCaseModal();
        });

        document.getElementById('btn-dc-trophy-back').addEventListener('click', () => {
            document.getElementById('dc-trophy-view').style.display = 'none';
            document.getElementById('dc-main-view').style.display = 'block';
        });
    }

    const footerRight = document.querySelector('.footer-right-group');
    if (footerRight && !document.getElementById('daily-challenge-hud-pill')) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.id = 'daily-challenge-hud-pill';
        pill.title = "Click to view Today's Daily Merit Award Challenge";
        pill.addEventListener('click', () => openDailyChallengeModal(true));
        footerRight.prepend(pill);
    }

    renderBadgeTray();
}

// Renders permanent earned badges in the bottom-right footer bar
function renderBadgeTray() {
    const footerRight = document.querySelector('.footer-right-group');
    if (!footerRight) return;

    let tray = document.getElementById('dc-badge-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.id = 'dc-badge-tray';
        const pill = document.getElementById('daily-challenge-hud-pill');
        if (pill) {
            footerRight.insertBefore(tray, pill);
        } else {
            footerRight.prepend(tray);
        }
    }

    const earned = getEarnedBadges();
    tray.innerHTML = '';

    // Show up to 8 most recent badges inline so the footer stays tidy
    const maxVisible = 8;
    const visibleBadges = earned.slice(-maxVisible);

    visibleBadges.forEach(badge => {
        const liveDef = DAILY_CHALLENGES.find(c => c.id === badge.id) || badge;
        const chip = document.createElement('div');
        chip.className = `dc-badge-chip dc-badge-${liveDef.tier || 'Silver'}`;
        chip.textContent = liveDef.icon || '🏅';
        chip.setAttribute(
            'data-tooltip',
            `${liveDef.icon || '🏅'} ${liveDef.title} (${liveDef.tier})\n${liveDef.description}`
        );
        chip.addEventListener('click', () => openTrophyCaseModal());
        tray.appendChild(chip);
    });

    // Overflow "+N" chip when student has earned more than 8 badges
    if (earned.length > maxVisible) {
        const more = document.createElement('div');
        more.className = 'dc-badge-chip dc-badge-Gold';
        more.style.fontSize = '0.68rem';
        more.style.fontWeight = '800';
        more.style.color = '#facc15';
        more.textContent = `+${earned.length - maxVisible}`;
        more.setAttribute('data-tooltip', `${earned.length} Total Merit Badges Earned!\nClick to view your Trophy Case.`);
        more.addEventListener('click', () => openTrophyCaseModal());
        tray.appendChild(more);
    }
}

// Opens the modal directly to the Trophy Case view
export function openTrophyCaseModal() {
    ensureDailyChallengeUI();
    refreshDailyState();

    document.getElementById('dc-main-view').style.display = 'none';
    document.getElementById('dc-selection-list').style.display = 'none';
    document.getElementById('dc-trophy-view').style.display = 'flex';

    const earned = getEarnedBadges();
    const earnedMap = new Map(earned.map(b => [b.id, b]));

    document.getElementById('dc-trophy-heading').textContent =
        `🏅 Merit Badge Trophy Case (${earned.length} / ${DAILY_CHALLENGES.length})`;

    const grid = document.getElementById('dc-trophy-grid');
    grid.innerHTML = '';

    // Show earned badges first, followed by locked challenges
    const sorted = [
        ...DAILY_CHALLENGES.filter(c => earnedMap.has(c.id)),
        ...DAILY_CHALLENGES.filter(c => !earnedMap.has(c.id))
    ];

    sorted.forEach(ch => {
        const record = earnedMap.get(ch.id);
        const card = document.createElement('div');
        card.className = `dc-trophy-card ${record ? 'earned' : 'locked'}`;
        card.innerHTML = `
            <div style="font-size: 1.75rem;">${ch.icon || '🏅'}</div>
            <div style="font-size: 0.78rem; font-weight: 800; color: #f8fafc; line-height: 1.2;">${ch.title}</div>
            <span class="dc-tier-badge dc-tier-${ch.tier || 'Silver'}" style="margin: 2px 0; font-size: 0.58rem; padding: 2px 7px;">
                ${ch.tier || 'Silver'}
            </span>
            <div style="font-size: 0.68rem; color: #94a3b8; line-height: 1.25;">${ch.description}</div>
            ${record ? `<div style="font-size: 0.64rem; color: #4ade80; font-weight: 700; margin-top: 2px;">✅ Earned ${record.earnedDate || ''}</div>` : ''}
        `;
        grid.appendChild(card);
    });

    document.getElementById('daily-challenge-modal').classList.add('open');
}

// Builds the list of available challenges for the student to select manually
function populateChallengeList() {
    const container = document.getElementById('dc-list-container');
    container.innerHTML = '';

    const earnedIds = new Set(getEarnedBadges().map(b => b.id));

    const general = DAILY_CHALLENGES.filter(c => !c.songs && !c.id.startsWith('boss_'));
    const singleSong = DAILY_CHALLENGES.filter(c => c.id.startsWith('boss_') && !c.songs);
    const setlists = DAILY_CHALLENGES.filter(c => c.songs);

    const addSection = (title, arr) => {
        if (arr.length === 0) return;
        const header = document.createElement('div');
        header.style.color = '#94a3b8';
        header.style.fontSize = '0.8rem';
        header.style.fontWeight = 'bold';
        header.style.margin = '12px 0 4px 4px';
        header.style.textTransform = 'uppercase';
        header.textContent = title;
        container.appendChild(header);

        arr.forEach(ch => {
            const item = document.createElement('div');
            item.className = 'dc-list-item';

            const isEarned = earnedIds.has(ch.id);
            const earnedTag = isEarned
                ? `<span style="color:#4ade80; font-size:0.72rem; font-weight:700; margin-left:6px;">✅ Earned</span>`
                : '';

            let songsHtml = '';
            if (ch.songs && ch.songs.length > 0) {
                songsHtml = `<div class="dc-song-list">Songs to choose from: ${ch.songs.join(', ')}</div>`;
            }

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <h4>${ch.icon || '🎯'} ${ch.title}${earnedTag}</h4>
                    <span class="dc-tier-badge dc-tier-${ch.tier || 'Silver'}" style="margin:0; font-size:0.6rem; padding:2px 8px; flex-shrink:0;">${ch.tier || 'Silver'}</span>
                </div>
                <p>${ch.description}</p>
                ${songsHtml}
            `;
            item.addEventListener('click', () => {
                selectNewChallenge(ch.id);
            });
            container.appendChild(item);
        });
    };

    addSection('General Skills & Exploration', general);
    addSection('Single-Song Bosses', singleSong);
    addSection('Themed Setlists', setlists);
}

// Handles switching the active challenge to a user-selected one
function selectNewChallenge(challengeId) {
    dailyState = {
        dateKey: getTodayDateKey(),
        challengeId: challengeId,
        accepted: true,
        progress: 0,
        completed: false,
        meta: {
            masteredSongs: [],
            mediumMasteredSongs: [],
            themesUsed: [],
            instrumentsUsed: [],
            lastSongTitle: '',
            consecutive85: 0,
            startedSlowLoop: false,
            stepCompletedSong: ''
        }
    };
    saveDailyState();

    document.getElementById('dc-selection-list').style.display = 'none';
    document.getElementById('dc-trophy-view').style.display = 'none';
    document.getElementById('dc-main-view').style.display = 'block';

    const ch = getTodaysChallenge();
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `🎯 New Merit Award Challenge Selected: ${ch.title}`;
    }

    openDailyChallengeModal(true);
    updateDailyHudPill();
}

export function promptDailyChallenge() {
    ensureDailyChallengeUI();
    refreshDailyState();
    updateDailyHudPill();
    renderBadgeTray();

    if (!dailyState.accepted && !dailyState.completed) {
        openDailyChallengeModal(false);
    }
}

export function openDailyChallengeModal(isManualView = false) {
    ensureDailyChallengeUI();
    refreshDailyState();

    document.getElementById('dc-main-view').style.display = 'block';
    document.getElementById('dc-selection-list').style.display = 'none';
    document.getElementById('dc-trophy-view').style.display = 'none';

    const ch = getTodaysChallenge();
    const pct = Math.min(100, Math.round((dailyState.progress / Math.max(1, ch.target)) * 100));

    document.getElementById('dc-icon').textContent = dailyState.completed ? '🏆' : (ch.icon || '🎯');
    const tierPill = document.getElementById('dc-tier-pill');
    tierPill.className = `dc-tier-badge dc-tier-${ch.tier || 'Gold'}`;
    tierPill.textContent = `${ch.tier ? ch.tier + ' • ' : ''}Daily Merit Award Challenge`;

    document.getElementById('dc-title').textContent = ch.title;
    document.getElementById('dc-desc').textContent = ch.description;

    // Show eligible songs whenever the student views an active setlist challenge
    const reqSongsEl = document.getElementById('dc-songs-required');
    if (ch.songs && ch.songs.length > 0) {
        reqSongsEl.textContent = `Songs to choose from: ${ch.songs.join(', ')}`;
        reqSongsEl.style.display = 'block';
    } else {
        reqSongsEl.style.display = 'none';
    }

    document.getElementById('dc-progress-label').textContent = dailyState.completed
        ? `COMPLETED! (${ch.target}/${ch.target} ${ch.unit})`
        : `${dailyState.progress} / ${ch.target} ${ch.unit}`;
    document.getElementById('dc-progress-fill').style.width = `${pct}%`;

    const acceptBtn = document.getElementById('btn-dc-accept');
    const skipBtn = document.getElementById('btn-dc-skip');
    const chooseBtn = document.getElementById('btn-dc-choose');
    const trophyBtn = document.getElementById('btn-dc-trophies');

    const earnedCount = getEarnedBadges().length;
    trophyBtn.textContent = `🏅 Trophy Case (${earnedCount}/${DAILY_CHALLENGES.length})`;
    chooseBtn.style.display = 'inline-flex';

    if (dailyState.completed) {
        acceptBtn.textContent = 'Awesome!';
        skipBtn.style.display = 'none';
    } else if (dailyState.accepted || isManualView) {
        acceptBtn.textContent = dailyState.accepted ? 'Keep Going!' : 'Accept Challenge!';
        skipBtn.style.display = dailyState.accepted ? 'none' : 'inline-flex';
    } else {
        acceptBtn.textContent = 'Accept Challenge!';
        skipBtn.style.display = 'inline-flex';
    }

    document.getElementById('daily-challenge-modal').classList.add('open');
}

function updateDailyHudPill() {
    const pill = document.getElementById('daily-challenge-hud-pill');
    if (!pill) return;

    refreshDailyState();
    const ch = getTodaysChallenge();

    if (dailyState.completed) {
        pill.classList.add('dc-done');
        pill.textContent = `✅ Merit Award Complete!`;
    } else if (dailyState.accepted) {
        pill.classList.remove('dc-done');
        pill.textContent = `${ch.icon || '🎯'} ${ch.title}: ${dailyState.progress}/${ch.target}`;
    } else {
        pill.classList.remove('dc-done');
        pill.textContent = `🎯 Daily Merit Award`;
    }
}

function playChallengeFanfare() {
    try {
        initAudio();
        const now = audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            gain.gain.setValueAtTime(0.2, now + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.48);
        });
    } catch (e) {}
}

function checkAndTriggerCompletion(challenge) {
    if (!dailyState || dailyState.completed) return;

    if (dailyState.progress >= challenge.target) {
        dailyState.progress = challenge.target;
        dailyState.completed = true;
        saveDailyState();
        awardPermanentBadge(challenge);
        updateDailyHudPill();
        playChallengeFanfare();

        if (bridge) {
            if (typeof bridge.unlockBonusSounds === 'function') {
                bridge.unlockBonusSounds(`Daily Challenge "${challenge.title}" completed!`);
            }
            if (typeof bridge.spawnConfetti === 'function') {
                const canvas = document.getElementById('waterfall-canvas');
                const cx = canvas ? canvas.width / 2 : 400;
                const cy = canvas ? canvas.height / 2 : 200;
                bridge.spawnConfetti(cx, cy, '#facc15');
            }
            if (typeof bridge.showFlashingStatus === 'function') {
                bridge.showFlashingStatus(`🏆 DAILY MERIT AWARD CHALLENGE COMPLETE: "${challenge.title}"! Badge Earned, Logged to Leaderboard & 5 Bonus Instruments Unlocked!`, 7000);
            }

            // Log completion directly to the Leaderboard Google Sheet
            const state = bridge.getState ? bridge.getState() : {};
            const studentName = (typeof bridge.ensureStudentName === 'function' ? bridge.ensureStudentName() : state.sessionStudentName)
                || localStorage.getItem('pianopad_name')
                || 'Student';
            const studentClass = state.currentStudentClass || localStorage.getItem('pianopad_class') || state.currentRoom || '';
            const entryTitle = `🎯 Merit Award: ${challenge.title}`;

            if (APPS_SCRIPT_URL && typeof bridge.sendJSONP === 'function') {
                const url = `${APPS_SCRIPT_URL}?action=SCORE_SUBMIT&name=${encodeURIComponent(studentName)}&title=${encodeURIComponent(entryTitle)}&score=100&tempo=${encodeURIComponent('100%')}&class=${encodeURIComponent(studentClass)}&studentClass=${encodeURIComponent(studentClass)}&t=${Date.now()}`;
                bridge.sendJSONP(url);
            }

            // Re-open modal briefly after completion so student can pick another challenge
            setTimeout(() => {
                openDailyChallengeModal(true);
            }, 1500);
        }
    } else {
        saveDailyState();
        updateDailyHudPill();
    }
}

// ============================================================================
// PROGRESS HOOKS CALLED FROM main.js
// ============================================================================

// Hook 1: Called inside showGameResultsPopUp() when a Game Mode song finishes
export function notifyDailySongComplete({
    songTitle,
    difficulty,
    accuracy,
    speed,
    perfect,
    miss,
    theme,
    instrument,
    showSheetMusic
}) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();
    const cleanTitle = (songTitle || '').trim();
    const diffLower = (difficulty || '').toLowerCase().trim();

    // Handle Multi-Song Setlist Challenges
    if (Array.isArray(ch.songs)) {
        const reqAcc = ch.minAccuracy || 85;
        const reqSpeed = ch.minSpeed || 100;
        const reqNoSheet = Boolean(ch.requireNoSheet);

        if (
            ch.songs.includes(cleanTitle) &&
            accuracy >= reqAcc &&
            speed >= reqSpeed &&
            (!reqNoSheet || !showSheetMusic)
        ) {
            if (!dailyState.meta.masteredSongs.includes(cleanTitle)) {
                dailyState.meta.masteredSongs.push(cleanTitle);
            }
            dailyState.progress = dailyState.meta.masteredSongs.length;
        }
    } else {
        switch (ch.id) {
            // General skill checks
            case 'play_game_20':
                dailyState.progress += 1;
                break;
            case 'master_5_90':
                if (accuracy >= 90 && speed >= 100 && cleanTitle) {
                    if (!dailyState.meta.masteredSongs.includes(cleanTitle)) {
                        dailyState.meta.masteredSongs.push(cleanTitle);
                    }
                    dailyState.progress = dailyState.meta.masteredSongs.length;
                }
                break;
            case 'perfect_100':
                if (accuracy >= 100 && speed >= 100) {
                    dailyState.progress = 1;
                }
                break;
            case 'zero_misses_med_hard':
                if ((diffLower === 'medium' || diffLower === 'hard') && miss === 0 && speed >= 100) {
                    dailyState.progress = 1;
                }
                break;
            case 'hard_song_85':
                if (diffLower === 'hard' && accuracy >= 85 && speed >= 100) {
                    dailyState.progress = 1;
                }
                break;
            case 'turbo_130':
                if (speed >= 130 && accuracy >= 85) {
                    dailyState.progress = 1;
                }
                break;
            case 'hyper_easy_160':
                if (diffLower === 'easy' && speed >= 160 && accuracy >= 80) {
                    dailyState.progress = 1;
                }
                break;
            case 'hat_trick_85':
                if (accuracy >= 85 && speed >= 100 && cleanTitle) {
                    if (dailyState.meta.lastSongTitle === cleanTitle) {
                        dailyState.meta.consecutive85 += 1;
                    } else {
                        dailyState.meta.lastSongTitle = cleanTitle;
                        dailyState.meta.consecutive85 = 1;
                    }
                    dailyState.progress = Math.max(dailyState.progress, dailyState.meta.consecutive85);
                } else {
                    dailyState.meta.consecutive85 = 0;
                }
                break;
            case 'total_perfect_300':
            case 'total_perfect_600':
                dailyState.progress += Number(perfect || 0);
                break;
            case 'waterfall_only_90':
                if (!showSheetMusic && (diffLower === 'medium' || diffLower === 'hard') && accuracy >= 90 && speed >= 100) {
                    dailyState.progress = 1;
                }
                break;
            case 'theme_explorer_3':
                if (theme && !dailyState.meta.themesUsed.includes(theme)) {
                    dailyState.meta.themesUsed.push(theme);
                }
                dailyState.progress = dailyState.meta.themesUsed.length;
                break;
            case 'instrument_explorer_3':
                if (instrument && !dailyState.meta.instrumentsUsed.includes(instrument)) {
                    dailyState.meta.instrumentsUsed.push(instrument);
                }
                dailyState.progress = dailyState.meta.instrumentsUsed.length;
                break;
            case 'step_to_game_80':
                if (dailyState.meta.stepCompletedSong && dailyState.meta.stepCompletedSong === cleanTitle && accuracy >= 80 && speed >= 100) {
                    dailyState.progress = 1;
                }
                break;
            case 'master_3_medium':
                if (diffLower === 'medium' && accuracy >= 85 && speed >= 100 && cleanTitle) {
                    if (!dailyState.meta.mediumMasteredSongs.includes(cleanTitle)) {
                        dailyState.meta.mediumMasteredSongs.push(cleanTitle);
                    }
                    dailyState.progress = dailyState.meta.mediumMasteredSongs.length;
                }
                break;

            // Single-song boss checks
            case 'boss_fire_flames':
                if (cleanTitle === 'Through the Fire & Flames - Piano Intro' && accuracy >= 80 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_bumblebee':
                if (cleanTitle === 'Flight of the Bumblebee' && accuracy >= 85 && speed >= 110) dailyState.progress = 1;
                break;
            case 'boss_mission_impossible':
                if (cleanTitle === 'Mission: Impossible Theme' && !showSheetMusic && accuracy >= 85 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_master_puppets':
                if (cleanTitle === 'Master of Puppets (recorded by JC)' && accuracy >= 90 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_megalovania':
                if (cleanTitle === 'Megalovania (from Undertale)' && miss === 0 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_sandstorm':
                if (cleanTitle === 'Sandstorm - by Darude' && accuracy >= 85 && speed >= 115) dailyState.progress = 1;
                break;
            case 'boss_moonlight':
                if (cleanTitle === 'Moonlight Sonata' && accuracy >= 85 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_thunderstruck':
                if (cleanTitle === 'Thunderstruck Guitar Intro' && accuracy >= 85 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_river_flows':
                if (cleanTitle === 'River Flows in You - Yiruma' && accuracy >= 80 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_sorcerer':
                if (cleanTitle === "The Sorcerer's Apprentice" && !showSheetMusic && accuracy >= 85 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_toccata':
                if (cleanTitle === 'Toccata and Fugue in D minor, BWV 565' && miss === 0 && speed >= 100) dailyState.progress = 1;
                break;
            case 'boss_thousand_miles':
                if (cleanTitle === 'Thousand Miles - by Vanessa Carlton' && accuracy >= 85 && speed >= 110) dailyState.progress = 1;
                break;
            case 'boss_wipeout':
                if (cleanTitle === 'Wipeout' && accuracy >= 80 && speed >= 115) dailyState.progress = 1;
                break;
            case 'boss_rickroll':
                if (cleanTitle === 'Never Gonna Give You Up' && accuracy >= 90 && speed >= 100) {
                    if (dailyState.meta.lastSongTitle === cleanTitle) {
                        dailyState.meta.consecutive85 += 1;
                    } else {
                        dailyState.meta.lastSongTitle = cleanTitle;
                        dailyState.meta.consecutive85 = 1;
                    }
                    dailyState.progress = Math.max(dailyState.progress, dailyState.meta.consecutive85);
                } else {
                    dailyState.meta.consecutive85 = 0;
                }
                break;
            case 'boss_espresso':
                if (cleanTitle === 'Espresso' && accuracy >= 90 && speed >= 140) dailyState.progress = 1;
                break;
            case 'boss_stand_up':
                if (cleanTitle === "Stand Up (Put Your Chair Away Or There You'll Stay)" && accuracy >= 95 && speed >= 100) dailyState.progress = 1;
                break;
        }
    }

    checkAndTriggerCompletion(ch);
}

// Hook 2: Called inside playManualNote() when currentPerfectStreak updates
export function notifyDailyStreak(streak) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();
    if (ch.id === 'streak_35' || ch.id === 'streak_60') {
        if (streak > dailyState.progress) {
            dailyState.progress = streak;
            checkAndTriggerCompletion(ch);
        }
    }
}

// Hook 3: Called inside updateMonitorWidget() once per second
export function notifyDailyTick({
    elapsedMs,
    tabSwitches,
    isPlaying,
    isLooping,
    isStepMode,
    stepFinished,
    currentSongTitle,
    speed
}) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();

    if (ch.id === 'no_tabs_20m' || ch.id === 'no_tabs_35m') {
        if (tabSwitches === 0) {
            const mins = Math.floor(elapsedMs / 60000);
            if (mins > dailyState.progress) {
                dailyState.progress = mins;
                checkAndTriggerCompletion(ch);
            }
        }
    } else if (ch.id === 'loop_climber') {
        if (isPlaying && isLooping) {
            if (speed <= 80) {
                dailyState.meta.startedSlowLoop = true;
            }
            if (dailyState.meta.startedSlowLoop && speed >= 100) {
                dailyState.progress = 1;
                checkAndTriggerCompletion(ch);
            }
        } else {
            dailyState.meta.startedSlowLoop = false;
        }
    } else if (ch.id === 'step_to_game_80') {
        if (isStepMode && stepFinished && currentSongTitle) {
            if (dailyState.meta.stepCompletedSong !== currentSongTitle.trim()) {
                dailyState.meta.stepCompletedSong = currentSongTitle.trim();
                saveDailyState();
            }
        }
    }
}

// Hook 4: Called inside toggleRecording() when a recording stops
export function notifyDailyRecording(noteCount) {
    refreshDailyState();
    if (dailyState.completed) return;

    const ch = getTodaysChallenge();
    if (ch.id === 'composer_16_notes' && noteCount >= 16) {
        dailyState.progress = 1;
        checkAndTriggerCompletion(ch);
    }
}
