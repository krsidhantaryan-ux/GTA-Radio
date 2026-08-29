import type { Station } from './types';
import blaineCountyLogo from './assets/logos/blaine-county.png';
import blueArkLogo from './assets/logos/blue-ark.png';
import channelXLogo from './assets/logos/channel-x.png';
import eastLosLogo from './assets/logos/east-los.png';
import flyloLogo from './assets/logos/flylo.png';
import losSantosLogo from './assets/logos/los-santos.png';
import lowdownLogo from './assets/logos/lowdown.png';
import nonStopPopLogo from './assets/logos/non-stop-pop.png';
import mirrorParkLogo from './assets/logos/radio-mirror-park.png';
import rebelLogo from './assets/logos/rebel.png';
import rockRadioLogo from './assets/logos/rock-radio.png';
import soulwaxLogo from './assets/logos/soulwax.png';
import spaceLogo from './assets/logos/space.png';
import vinewoodLogo from './assets/logos/vinewood.png';
import wctrLogo from './assets/logos/wctr.png';
import westCoastClassicsLogo from './assets/logos/west-coast-classics.png';
import worldwideLogo from './assets/logos/worldwide.png';

export const stations: Station[] = [
  { id: 'blonded', name: 'Blonded Los Santos 97.8 FM', short: 'blonded', mark: 'blonded', color: '#def419', genre: 'Contemporary R&B · Rap', aliases: ['blonded', 'blonded los santos'] },
  { id: 'flylo', logo: flyloLogo, name: 'FlyLo FM', short: 'FLYLO', mark: 'FLYLO\nFM', color: '#b8a06d', genre: 'Electronic · IDM', aliases: ['flylo', 'flylo fm'] },
  { id: 'worldwide', logo: worldwideLogo, name: 'Worldwide FM', short: 'Worldwide', mark: 'WORLD\nWIDE', color: '#41a69e', genre: 'World · Jazz · Electronic', aliases: ['worldwide', 'worldwide fm'] },
  { id: 'west-coast-classics', logo: westCoastClassicsLogo, name: 'West Coast Classics', short: 'WCC', mark: 'WEST COAST\nCLASSICS', color: '#fff', genre: 'Classic West Coast Hip-Hop', aliases: ['west coast classics', 'wcc'] },
  { id: 'wctr', logo: wctrLogo, name: 'West Coast Talk Radio', short: 'WCTR', mark: 'WCTR', color: '#ff7346', genre: 'Talk Radio', aliases: ['wctr', 'west coast talk radio'] },
  { id: 'vinewood', logo: vinewoodLogo, name: 'Vinewood Boulevard Radio', short: 'VBR', mark: 'VINEWOOD\nBOULEVARD', color: '#eee', genre: 'Alternative Rock', aliases: ['vinewood', 'vinewood boulevard radio'] },
  { id: 'lowdown', logo: lowdownLogo, name: 'The Lowdown 91.1', short: 'Lowdown', mark: 'THE\nLOW\nDOWN', color: '#e2a329', genre: 'Soul · Funk', aliases: ['lowdown', 'the lowdown'] },
  { id: 'lab', name: 'The Lab', short: 'The Lab', mark: 'THE\nLAB', color: '#fff', genre: 'Electronic · Hip-Hop', aliases: ['the lab', 'lab'] },
  { id: 'blue-ark', logo: blueArkLogo, name: 'The Blue Ark', short: 'Blue Ark', mark: 'THE\nBLUE ARK', color: '#78a9d7', genre: 'Reggae · Dub · Dancehall', aliases: ['blue ark', 'the blue ark'] },
  { id: 'still-slipping', name: 'Still Slipping Los Santos', short: 'Still Slipping', mark: 'STILL\nSLIPPING', color: '#ff8c80', genre: 'UK Garage · House', aliases: ['still slipping', 'still slipping los santos'] },
  { id: 'kult', name: 'Kult FM 99.1', short: 'K.U.L.T.', mark: 'KULT\n99.1', color: '#758da1', genre: 'Post-Punk · Alternative', aliases: ['kult', 'kult fm'] },
  { id: 'soulwax', logo: soulwaxLogo, name: 'Soulwax FM', short: 'Soulwax', mark: 'SOULWAX\nFM', color: '#eee', genre: 'Electronic · Dance', aliases: ['soulwax', 'soulwax fm'] },
  { id: 'rebel', logo: rebelLogo, name: 'Rebel Radio', short: 'Rebel', mark: 'REBEL\nRADIO', color: '#d4214e', genre: 'Country', aliases: ['rebel', 'rebel radio'] },
  { id: 'radio-mirror-park', logo: mirrorParkLogo, name: 'Radio Mirror Park', short: 'Mirror Park', mark: 'RADIO\nMIRROR\nPARK', color: '#fc6723', genre: 'Indie · Synthpop', aliases: ['radio mirror park', 'mirror park'] },
  { id: 'los-santos', logo: losSantosLogo, name: 'Radio Los Santos', short: 'Radio LS', mark: 'RADIO\nLOS SANTOS', color: '#ffd928', genre: 'Modern Hip-Hop', aliases: ['radio los santos', 'los santos'] },
  { id: 'non-stop-pop', logo: nonStopPopLogo, name: 'Non-Stop-Pop FM', short: 'Non Stop Pop', mark: 'NON\nSTOP\nPOP', color: '#ffeb77', genre: 'Pop · Dance', aliases: ['non stop pop', 'non-stop-pop', 'non stop pop fm'] },
  { id: 'music-locker', name: 'The Music Locker', short: 'Music Locker', mark: 'THE MUSIC\nLOCKER', color: '#bbb', genre: 'House · Techno', aliases: ['music locker', 'the music locker'] },
  { id: 'space', logo: spaceLogo, name: 'Space 103.2', short: 'Space', mark: 'SPACE\n103.2', color: '#ff3980', genre: 'Funk', aliases: ['space', 'space 103.2'] },
  { id: 'lsur', name: 'Los Santos Underground Radio', short: 'LSUR', mark: 'LS\nUR', color: '#fff', genre: 'House · Techno', aliases: ['lsur', 'los santos underground radio'] },
  { id: 'rock-radio', logo: rockRadioLogo, name: 'Los Santos Rock Radio', short: 'LS Rock', mark: 'LOS SANTOS\nROCK RADIO', color: '#eee', genre: 'Classic Rock', aliases: ['los santos rock radio', 'rock radio'] },
  { id: 'east-los', logo: eastLosLogo, name: 'East Los FM', short: 'East Los', mark: 'EAST\nLOS FM', color: '#edce2d', genre: 'Mexican · Latin Rock', aliases: ['east los', 'east los fm'] },
  { id: 'channel-x', logo: channelXLogo, name: 'Channel X', short: 'Channel X', mark: 'CHANNEL\nX', color: '#ef3340', genre: 'Punk Rock', aliases: ['channel x'] },
  { id: 'blaine-county', logo: blaineCountyLogo, name: 'Blaine County Radio', short: 'Blaine County', mark: 'BLAINE COUNTY\nRADIO', color: '#e33b43', genre: 'Talk Radio', aliases: ['blaine county', 'blaine county radio'] },
  { id: 'off', name: 'Radio Off', short: 'Off', mark: '◯', color: '#888', genre: 'Silence', aliases: ['off'] }
];
