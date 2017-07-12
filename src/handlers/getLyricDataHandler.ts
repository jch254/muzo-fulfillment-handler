import { mapMode, mapPitchClassToKey } from '../utils';
import LexEvent from '../LexEvent';
import LexResponse from '../LexResponse';

export interface GetLyricDataSlots {
  lyric: string | null;
  geniusSongId: number | null;
}

export interface GetLyricDataIntent {
  name: 'GetLyricData';
  slots: GetLyricDataSlots;
}

export default async function getLyricDataHandler(
  event: LexEvent,
  lyricist: any,
  spotifyApi: any,
): Promise<LexResponse> {
  console.log('getLyricDataHandler');

  const authData = await spotifyApi.clientCredentialsGrant();
  spotifyApi.setAccessToken(authData.body['access_token']);

  const intent = event.currentIntent as GetLyricDataIntent;

  if (intent.slots.lyric === null && intent.slots.geniusSongId === null) {
    return {
      sessionAttributes: {},
      dialogAction: {
        type: 'Close',
        fulfillmentState: 'Fulfilled',
        message: {
          contentType: 'PlainText',
          content: `Damn! Scope found no matches... Try scope another lyric or title.`,
        },
      },
    };
  }

  let geniusMatches: any[] = [];
  if (intent.slots.lyric !== null) {
    geniusMatches = await lyricist.search(intent.slots.lyric);
   
    console.log(`geniusMatches: ${JSON.stringify(geniusMatches)}`);

    if (geniusMatches.length === 0) {
      return {
        sessionAttributes: {},
        dialogAction: {
          type: 'Close',
          fulfillmentState: 'Fulfilled',
          message: {
            contentType: 'PlainText',
            content: `Damn! Scope found no matches for '${intent.slots.lyric}'... Try scope another lyric or title.`,
          },
        },
      };
    }
  }

  const fullGeniusSong = await lyricist.song(
    intent.slots.geniusSongId !== null ? intent.slots.geniusSongId : geniusMatches[0].id,
    { fetchLyrics: false },
  );

  // TODO: Handle null fullGeniusSong

  console.log(`fullGeniusSong: ${JSON.stringify(fullGeniusSong)}`);

  let spotifyMedia = fullGeniusSong.media.find((media: any) => media.provider.toLowerCase() === 'spotify');
  const youtubeMedia = fullGeniusSong.media.find((media: any) => media.provider.toLowerCase() === 'youtube');
  const soundcloudMedia = fullGeniusSong.media.find((media: any) => media.provider.toLowerCase() === 'soundcloud');
  const appleMusicMedia = fullGeniusSong.media.find((media: any) => media.provider.toLowerCase() === 'apple_music');

  const samples = fullGeniusSong.song_relationships.find((r: any) => r.type === 'samples').songs;
  const sampledIn = fullGeniusSong.song_relationships.find((r: any) => r.type === 'sampled_in').songs;

  let audioFeatures;
  if (spotifyMedia !== undefined) {
    const spotifyNativeUriParts = spotifyMedia.native_uri.split(':');
    const spotifyTrackId = spotifyNativeUriParts[spotifyNativeUriParts.length - 1].trim();

    const audioFeaturesResponse = await spotifyApi.getAudioFeaturesForTrack(spotifyTrackId);
    audioFeatures = audioFeaturesResponse.body;
  } else {
    const spotifyTracks = await spotifyApi.searchTracks(`track:${fullGeniusSong.title.trim()}\
${fullGeniusSong.album !== null ? ` album:${fullGeniusSong.album.name.trim()}` : ''}`);

    console.log(`spotifyTracks: ${JSON.stringify(spotifyTracks)}`);

    if (spotifyTracks.body.tracks.total > 0) {
      const spotifyTrack = spotifyTracks.body.tracks.items[0];

      spotifyMedia = { url: spotifyTrack.external_urls.spotify };

      const audioFeaturesResponse = await spotifyApi.getAudioFeaturesForTrack(spotifyTrack.id);
      audioFeatures = audioFeaturesResponse.body.track;

      console.log(`audioFeatures: ${JSON.stringify(audioFeatures)}`);
    }
  }

  let responseMessage = `Title: ${fullGeniusSong.title_with_featured}
Artist: ${fullGeniusSong.primary_artist.name}`;

  if (fullGeniusSong.album !== null) {
    responseMessage += `
Album: ${fullGeniusSong.album.name}`;
  }

  if (fullGeniusSong.release_date !== null) {
    responseMessage += `
Release date: ${fullGeniusSong.release_date}`;
  }

  if (fullGeniusSong.recording_location !== null) {
    responseMessage += `
Recorded at: ${fullGeniusSong.recording_location}`;
  }

  if (audioFeatures !== undefined) {
    responseMessage += `
BPM: ${audioFeatures.tempo.toFixed(0)}
Key: ${mapPitchClassToKey(audioFeatures.key)} ${mapMode(audioFeatures.mode)}`;
  }

  if (samples.length > 0) {
    responseMessage += `

Sample${samples.length === 1 ? '' : 's'}
${samples.map((s: any) => `- ${s.full_title}`).join('\n')}`;
  }

  if (sampledIn.length > 0) {
    responseMessage += `

Sampled in
${sampledIn.map((s: any) => `- ${s.full_title}`).join('\n')}`;
  }

  if (fullGeniusSong.producer_artists.length > 0) {
    responseMessage += `

Producer${fullGeniusSong.producer_artists.length === 1 ? '' : 's'}
${fullGeniusSong.producer_artists.map((p: any) => `- ${p.name}`).join('\n')}`;
  }

  if (fullGeniusSong.writer_artists.length > 0) {
    responseMessage += `

Writer${fullGeniusSong.writer_artists.length === 1 ? '' : 's'}
${fullGeniusSong.writer_artists.map((w: any) => `- ${w.name}`).join('\n')}`;
  }

  const attachments = [];

  if (spotifyMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_thumbnail_url,
      attachmentLinkUrl: spotifyMedia.url,
    });
  }

  if (appleMusicMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_thumbnail_url,
      attachmentLinkUrl: appleMusicMedia.url,
    });
  }

  if (soundcloudMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_thumbnail_url,
      attachmentLinkUrl: soundcloudMedia.url,
    });
  }

  if (youtubeMedia !== undefined) {
    attachments.push({
      title: fullGeniusSong.title_with_featured.substring(0, 80),
      subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
      imageUrl: fullGeniusSong.song_art_image_thumbnail_url,
      attachmentLinkUrl: youtubeMedia.url,
    });
  }

  attachments.push({
    title: fullGeniusSong.title_with_featured.substring(0, 80),
    subTitle: fullGeniusSong.primary_artist.name.substring(0, 80),
    imageUrl: fullGeniusSong.song_art_image_thumbnail_url,
    attachmentLinkUrl: fullGeniusSong.url,
  });

  const currentGeniusMatches = intent.slots.geniusSongId === null ?
     geniusMatches
      .slice(1, Math.min(geniusMatches.length, 11))
      .map(song => ({
        id: song.id,
        titleWithFeatured: song.title_with_featured.substring(0, 80),
        artistName: song.primary_artist.name.substring(0, 80),
        imageUrl: song.song_art_image_thumbnail_url,
        url: song.url,
      })) :
      undefined;

  return {
    sessionAttributes: currentGeniusMatches !== undefined ?
      { currentGeniusMatches: JSON.stringify(currentGeniusMatches) } :
      {},
    dialogAction: {
      type: 'Close',
      fulfillmentState: 'Fulfilled',
      message: {
        contentType: 'PlainText',
        content: responseMessage,
      },
      responseCard: {
        contentType: 'application/vnd.amazonaws.card.generic',
        version: 1,
        genericAttachments: attachments,
      },
    },
  };
}
