import type { ReactElement } from 'react'

const palettes: Record<string, [string, string, string, string, string]> = {
  Cinematic: ['#132433', '#437c88', '#efa965', '#744e5b', '#192d37'],
  Hollywood: ['#32263a', '#a45755', '#ffd38a', '#ab684a', '#402b3e'],
  'Vintage and Retro': ['#384c49', '#9c9a74', '#e2bb83', '#a66b5c', '#544b45'],
  'Film Grain': ['#1b3340', '#788879', '#d5b78a', '#986f66', '#34454a'],
  'Dark and Moody': ['#101c31', '#364c68', '#97a8af', '#4c3d52', '#111e30'],
  'Bright and Clean': ['#4d93b1', '#a8d8d4', '#ffdb91', '#67a8a0', '#428779'],
  'Warm Tones': ['#614352', '#ce795b', '#ffd08a', '#be7355', '#61404a'],
  'Cool Tones': ['#15344b', '#5195ac', '#c9e7e1', '#5e7896', '#233c56'],
  'Black and White': ['#222630', '#92959a', '#f0e6cf', '#74777d', '#303139'],
  'Anime Inspired': ['#4d5c96', '#c189c0', '#ffdf9a', '#8a78bb', '#4b4d79'],
  'Gaming and Neon': ['#211f55', '#9d4da6', '#ffc56e', '#397994', '#262657'],
  'Street and Urban': ['#27363b', '#758a83', '#d2b27a', '#8d5c50', '#2e3b3c'],
  Portrait: ['#73526a', '#cf8f87', '#ffe0b2', '#c98b70', '#755364'],
  Nature: ['#23493e', '#82ad80', '#f2d28e', '#75936c', '#2e5748'],
  Sunset: ['#633558', '#df795c', '#ffd681', '#cd755a', '#614251'],
  Night: ['#101a36', '#314c79', '#d6a5a5', '#5d4c81', '#182b4a'],
  'VHS and Analog': ['#25384c', '#95806c', '#e4af77', '#a25c68', '#354655'],
  'Social Media': ['#5260a0', '#c87d91', '#ffdc8c', '#56a8a0', '#505281'],
  'Custom User Presets': ['#344d65', '#8b87b2', '#e1c08a', '#a06d81', '#374b62'],
  Basic: ['#234c58', '#9c9c78', '#f1c382', '#9c635e', '#325057'],
  'Camera Movement': ['#173d50', '#6ea0a5', '#ffd080', '#b65c5a', '#294958'],
  Zoom: ['#2d315b', '#7f79b1', '#ffd28a', '#a85875', '#383c67'],
  'Motion Blur': ['#174553', '#55a0a0', '#f3cc84', '#d07157', '#345d63'],
  Glitch: ['#20184e', '#b1509a', '#f8c778', '#3b9fb0', '#312852'],
  'Light Leaks': ['#50334b', '#b45f64', '#ffcf83', '#d47856', '#59404b'],
  Flash: ['#3e4c70', '#a0a8b2', '#fff2cf', '#788fb0', '#43516b'],
  Swipe: ['#264751', '#6f9a8d', '#f2ca86', '#b45f58', '#37544d'],
  Spin: ['#43345f', '#9772a5', '#ffd38b', '#cc785d', '#4f3b64'],
  Distortion: ['#1b3e52', '#4d8ea0', '#e6bf83', '#bb5370', '#293f55'],
  Retro: ['#3a4c4c', '#a69572', '#e6c38b', '#b37c6d', '#554943'],
  Creative: ['#33345b', '#9277ad', '#f4ca8a', '#61a19b', '#383d65'],
}

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-')

export default function EffectCover({ id, category }: { id: string; category: string }): ReactElement {
  const key = safeId(id)
  const [sky, horizon, sun, hillFar, hillNear] = palettes[category] ?? palettes.Creative
  return (
    <svg className="cover-art" viewBox="0 0 160 76" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${category} preview artwork`}>
      <defs>
        <linearGradient id={`${key}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky} />
          <stop offset="0.62" stopColor={horizon} />
          <stop offset="1" stopColor={sun} />
        </linearGradient>
        <linearGradient id={`${key}-shade`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".48" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#07101d" stopOpacity=".48" />
        </linearGradient>
        <radialGradient id={`${key}-glow`}>
          <stop stopColor={sun} stopOpacity=".72" />
          <stop offset="1" stopColor={sun} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="76" fill={`url(#${key}-sky)`} />
      <circle cx="119" cy="27" r="27" fill={`url(#${key}-glow)`} />
      <circle cx="119" cy="27" r="9" fill={sun} opacity=".94" />
      <path d="M0 48 22 33l14 10 25-26 27 31 17-17 25 19 16-11 14 12v25H0Z" fill={hillFar} opacity=".82" />
      <path d="m0 58 25-13 18 8 23-16 20 15 15-8 20 11 20-10 19 11v20H0Z" fill={hillNear} />
      <path d="M0 66q22-12 44-3t43 1q22-13 43-1t30 0v13H0Z" fill="#101923" opacity=".38" />
      <g fill="#111b26" opacity=".78">
        <path d="m19 52 5-17 5 17h-3l5 11H17l5-11z" />
        <path d="m43 57 4-14 4 14h-2l4 8H41l4-8z" />
        <path d="m139 53 5-18 5 18h-3l5 12h-14l5-12z" />
      </g>
      <path d="M0 0h160v76H0z" fill={`url(#${key}-shade)`} />
      <path d="M6 7h148v62H6z" fill="none" stroke="#ffffff" strokeOpacity=".14" />
      <circle cx="13" cy="13" r="1.2" fill="#fff" opacity=".75" />
      <circle cx="20" cy="13" r="1.2" fill="#fff" opacity=".42" />
      <path d="M8 64h144" stroke="#fff" strokeOpacity=".2" />
    </svg>
  )
}
