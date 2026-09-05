import { Track } from './Track.js';
import { Ground } from './Ground.js';
import { Scenery, disposeTree } from './Scenery.js';
import { StreetLamps } from './StreetLamps.js';
import { StartFinish } from './StartFinish.js';
import { getTheme } from './themes.js';
import { getTrack } from './tracks/index.js';

// Owns the world for one track: builds Track/Ground/Scenery/StreetLamps/
// StartFinish from a track data file, and tears them all down on a switch.
// Everything downstream (AI, checkpoints, minimap, pickups) reads `samples`
// and `roadWidth` from here, so no system needs track-specific knowledge.

const TRACK_SAMPLE_COUNT = 240;

export class TrackManager {
  constructor({ scene }) {
    this.scene = scene;
    this.current = null;
  }

  // Builds the given track id and returns the world handles the Game needs.
  load(trackId) {
    this.dispose();

    const data = getTrack(trackId);
    const theme = getTheme(data.theme);

    const track = new Track(data);
    track.addTo(this.scene);

    const samples = track.getSampledPositions(TRACK_SAMPLE_COUNT);

    const ground = new Ground(theme);
    ground.addTo(this.scene);

    const scenery = new Scenery({ samples, theme, sceneryData: data.scenery });
    scenery.addTo(this.scene);

    const streetLamps = new StreetLamps({ track, lampData: data.streetLamps });
    streetLamps.addTo(this.scene);

    const startFinish = new StartFinish({ track });
    startFinish.addTo(this.scene);

    this.current = {
      data,
      theme,
      track,
      samples,
      ground,
      scenery,
      streetLamps,
      startFinish,
      roadWidth: data.roadWidth,
    };
    return this.current;
  }

  dispose() {
    if (!this.current) return;
    const { track, ground, scenery, streetLamps, startFinish } = this.current;

    for (const object of track.objects) {
      disposeTree(object);
      object.removeFromParent();
    }
    ground.dispose();
    ground.mesh.removeFromParent();
    scenery.dispose();
    disposeTree(streetLamps.group);
    streetLamps.group.removeFromParent();
    disposeTree(startFinish.group);
    startFinish.group.removeFromParent();

    this.current = null;
  }
}
