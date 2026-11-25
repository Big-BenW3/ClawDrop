// Sticker art for the Odds list, ported verbatim from the mockup (static, trusted markup).
// The 3D plush on the machine and the cards are built by app/scene/engine.ts, not from these.
export const CREATURE_SVG: Record<string, string> = {
  'gilded-wyrm': `<svg viewBox="0 0 160 160" class="w-full h-full sticker-outline" xmlns="http://www.w3.org/2000/svg">
      <defs>
      <radialGradient id="gw-bg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#FFF3B0"/>
      <stop offset="100%" stop-color="#F5B301"/>
      </radialGradient>
      </defs>
      <!-- Sticker White/Gold Backing -->
      <circle cx="80" cy="84" r="62" fill="url(#gw-bg)" stroke="#0B0E14" stroke-width="6"/>
      <!-- Floating Stars -->
      <path d="M26 42l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#FFF" stroke="#0B0E14" stroke-width="2.5"/>
      <path d="M134 48l2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5z" fill="#FFF" stroke="#0B0E14" stroke-width="2.5"/>
      <!-- Dragon Wings -->
      <path d="M36 86 C16 68, 18 46, 44 62 Z" fill="#FB923C" stroke="#0B0E14" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M124 86 C144 68, 142 46, 116 62 Z" fill="#FB923C" stroke="#0B0E14" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- Chubby Dragon Body -->
      <ellipse cx="80" cy="96" rx="38" ry="34" fill="#FBBF24" stroke="#0B0E14" stroke-width="5"/>
      <ellipse cx="80" cy="102" rx="22" ry="20" fill="#FEF08A" stroke="#0B0E14" stroke-width="3.5"/>
      <!-- Head -->
      <circle cx="80" cy="64" r="28" fill="#FBBF24" stroke="#0B0E14" stroke-width="5"/>
      <!-- Royal Crown -->
      <path d="M61 40 L65 23 L74 34 L80 20 L86 34 L95 23 L99 40 Z" fill="#A855F7" stroke="#0B0E14" stroke-width="4" stroke-linejoin="round"/>
      <!-- Expressive Half-Lid Cool Eyes -->
      <ellipse cx="69" cy="62" rx="7" ry="6" fill="#FFF" stroke="#0B0E14" stroke-width="3.5"/>
      <circle cx="70" cy="63" r="3" fill="#0B0E14"/>
      <path d="M61 59h16" stroke="#0B0E14" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="91" cy="62" rx="7" ry="6" fill="#FFF" stroke="#0B0E14" stroke-width="3.5"/>
      <circle cx="90" cy="63" r="3" fill="#0B0E14"/>
      <path d="M83 59h16" stroke="#0B0E14" stroke-width="4" stroke-linecap="round"/>
      <!-- Snout & Cheeky Fang -->
      <path d="M72 74 Q80 80 88 74" fill="none" stroke="#0B0E14" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M84 75 L86 80 L89 74" fill="#FFF" stroke="#0B0E14" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Feet -->
      <ellipse cx="62" cy="126" rx="11" ry="7" fill="#F59E0B" stroke="#0B0E14" stroke-width="4"/>
      <ellipse cx="98" cy="126" rx="11" ry="7" fill="#F59E0B" stroke="#0B0E14" stroke-width="4"/>
      </svg>`,
  'void-hopper': `<svg viewBox="0 0 160 160" class="w-full h-full sticker-outline" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="86" r="60" fill="#2E1065" stroke="#0B0E14" stroke-width="6"/>
      <!-- Tall Bunny Ears -->
      <rect x="54" y="18" width="16" height="44" rx="8" transform="rotate(-10 62 40)" fill="#C084FC" stroke="#0B0E14" stroke-width="4.5"/>
      <rect x="90" y="18" width="16" height="44" rx="8" transform="rotate(10 98 40)" fill="#C084FC" stroke="#0B0E14" stroke-width="4.5"/>
      <!-- Hoodie Body -->
      <path d="M46 126 C46 96, 114 96, 114 126 Z" fill="#7E22CE" stroke="#0B0E14" stroke-width="5" stroke-linejoin="round"/>
      <!-- Head -->
      <ellipse cx="80" cy="76" rx="32" ry="27" fill="#D8B4FE" stroke="#0B0E14" stroke-width="5"/>
      <!-- Neon Cyber Visor -->
      <rect x="50" y="64" width="60" height="17" rx="8.5" fill="#34D399" stroke="#0B0E14" stroke-width="4"/>
      <path d="M58 69 L72 76" stroke="#FFF" stroke-width="3" stroke-linecap="round"/>
      <!-- Headphones -->
      <rect x="40" y="64" width="10" height="24" rx="5" fill="#F5B301" stroke="#0B0E14" stroke-width="4"/>
      <rect x="110" y="64" width="10" height="24" rx="5" fill="#F5B301" stroke="#0B0E14" stroke-width="4"/>
      <!-- Smirk -->
      <path d="M73 90 Q81 95 88 88" fill="none" stroke="#0B0E14" stroke-width="3.5" stroke-linecap="round"/>
      </svg>`,
  'volt-axolotl': `<svg viewBox="0 0 160 160" class="w-full h-full sticker-outline" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="84" r="60" fill="#1E3A8A" stroke="#0B0E14" stroke-width="6"/>
      <!-- Lightning Gills -->
      <path d="M46 58 L26 48 L36 64 L22 68 L44 76" fill="#60A5FA" stroke="#0B0E14" stroke-width="4" stroke-linejoin="round"/>
      <path d="M114 58 L134 48 L124 64 L138 68 L116 76" fill="#60A5FA" stroke="#0B0E14" stroke-width="4" stroke-linejoin="round"/>
      <!-- Body -->
      <ellipse cx="80" cy="96" rx="28" ry="24" fill="#93C5FD" stroke="#0B0E14" stroke-width="5"/>
      <!-- Head -->
      <ellipse cx="80" cy="68" rx="34" ry="25" fill="#BFDBFE" stroke="#0B0E14" stroke-width="5"/>
      <!-- Happy Eyes -->
      <circle cx="67" cy="67" r="5" fill="#0B0E14"/>
      <circle cx="65.5" cy="65.5" r="1.8" fill="#FFF"/>
      <circle cx="93" cy="67" r="5" fill="#0B0E14"/>
      <circle cx="91.5" cy="65.5" r="1.8" fill="#FFF"/>
      <!-- Wide Derpy Smile -->
      <path d="M70 76 Q80 85 90 76" fill="none" stroke="#0B0E14" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Mini Skateboard at bottom -->
      <rect x="44" y="118" width="72" height="10" rx="5" fill="#F87171" stroke="#0B0E14" stroke-width="4"/>
      <circle cx="58" cy="131" r="5" fill="#FBBF24" stroke="#0B0E14" stroke-width="3"/>
      <circle cx="102" cy="131" r="5" fill="#FBBF24" stroke="#0B0E14" stroke-width="3"/>
      </svg>`,
  'pebble-crab': `<svg viewBox="0 0 160 160" class="w-full h-full sticker-outline" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="84" r="60" fill="#334155" stroke="#0B0E14" stroke-width="6"/>
      <!-- Claws -->
      <circle cx="38" cy="76" r="14" fill="#F87171" stroke="#0B0E14" stroke-width="4.5"/>
      <path d="M32 66 L38 76 L44 66" fill="#334155" stroke="#0B0E14" stroke-width="3.5"/>
      <circle cx="122" cy="76" r="14" fill="#F87171" stroke="#0B0E14" stroke-width="4.5"/>
      <path d="M116 66 L122 76 L128 66" fill="#334155" stroke="#0B0E14" stroke-width="3.5"/>
      <!-- Shell Body -->
      <ellipse cx="80" cy="92" rx="34" ry="26" fill="#94A3B8" stroke="#0B0E14" stroke-width="5"/>
      <!-- Sideways Cap -->
      <path d="M62 67 C62 52, 98 52, 98 67 Z" fill="#3B82F6" stroke="#0B0E14" stroke-width="4"/>
      <rect x="86" y="63" width="24" height="6" rx="3" fill="#60A5FA" stroke="#0B0E14" stroke-width="3.5"/>
      <!-- Chill Eyes -->
      <circle cx="69" cy="86" r="5" fill="#FFF" stroke="#0B0E14" stroke-width="3"/>
      <circle cx="70" cy="86" r="2.2" fill="#0B0E14"/>
      <circle cx="91" cy="86" r="5" fill="#FFF" stroke="#0B0E14" stroke-width="3"/>
      <circle cx="90" cy="86" r="2.2" fill="#0B0E14"/>
      <!-- Flat Chill Mouth -->
      <path d="M74 99 H86" stroke="#0B0E14" stroke-width="3.5" stroke-linecap="round"/>
      </svg>`,
  'mochi-sprout': `<svg viewBox="0 0 160 160" class="w-full h-full sticker-outline" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="84" r="60" fill="#1E293B" stroke="#0B0E14" stroke-width="6"/>
      <!-- Leaf Sprout on Top -->
      <path d="M80 54 V38" stroke="#0B0E14" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M80 42 C64 30, 56 42, 74 48 Z" fill="#34D399" stroke="#0B0E14" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M80 40 C96 28, 104 40, 86 46 Z" fill="#34D399" stroke="#0B0E14" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- Squishy Mochi Blob -->
      <path d="M44 106 C44 64, 116 64, 116 106 C116 122, 44 122, 44 106 Z" fill="#F8FAFC" stroke="#0B0E14" stroke-width="5"/>
      <!-- Blush Cheeks -->
      <ellipse cx="60" cy="96" rx="6" ry="3.5" fill="#FDA4AF"/>
      <ellipse cx="100" cy="96" rx="6" ry="3.5" fill="#FDA4AF"/>
      <!-- Sleepy U Eyes -->
      <path d="M64 88 Q69 94 74 88" fill="none" stroke="#0B0E14" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M86 88 Q91 94 96 88" fill="none" stroke="#0B0E14" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Tiny Cat Mouth -->
      <path d="M76 96 Q80 100 84 96" fill="none" stroke="#0B0E14" stroke-width="3" stroke-linecap="round"/>
      </svg>`,
};
