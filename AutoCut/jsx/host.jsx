// AutoCut - lado do Premiere (ExtendScript, ES3: sem let/const/arrow).

var PC_TICKS = 254016000000;

function pc_json(v) {
  if (v === null || v === undefined) return 'null';
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? String(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
  }
  var parts = [], i;
  if (v instanceof Array) {
    for (i = 0; i < v.length; i++) parts.push(pc_json(v[i]));
    return '[' + parts.join(',') + ']';
  }
  for (var k in v) {
    if (v.hasOwnProperty(k)) parts.push(pc_json(String(k)) + ':' + pc_json(v[k]));
  }
  return '{' + parts.join(',') + '}';
}

function pc_err(msg) {
  return pc_json({ ok: false, error: String(msg) });
}

function pc_isLocked(track) {
  try { return track.isLocked(); } catch (e) { return false; }
}

function pc_clipList(track) {
  var clips = [];
  for (var c = 0; c < track.clips.numItems; c++) {
    var it = track.clips[c];
    var path = '';
    try { if (it.projectItem) path = it.projectItem.getMediaPath(); } catch (e1) {}
    clips.push({
      name: it.name,
      path: path,
      inPoint: it.inPoint.seconds,
      start: it.start.seconds,
      end: it.end.seconds
    });
  }
  return clips;
}

function pc_getSequenceInfo() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return pc_err('Nenhuma sequencia ativa. Abra a sequencia do podcast na timeline.');
    var tb = parseFloat(seq.timebase);
    var info = {
      ok: true,
      name: seq.name,
      frameDur: tb / PC_TICKS,
      duration: parseFloat(seq.end) / PC_TICKS,
      videoTracks: [],
      audioTracks: []
    };
    var v, a;
    for (v = 0; v < seq.videoTracks.numTracks; v++) {
      var vt = seq.videoTracks[v];
      info.videoTracks.push({
        index: v,
        name: vt.name || ('V' + (v + 1)),
        clips: pc_clipList(vt),
        firstClip: vt.clips.numItems ? vt.clips[0].name : '',
        locked: pc_isLocked(vt)
      });
    }
    for (a = 0; a < seq.audioTracks.numTracks; a++) {
      var at = seq.audioTracks[a];
      info.audioTracks.push({ index: a, name: at.name || ('A' + (a + 1)), clips: pc_clipList(at) });
    }
    return pc_json(info);
  } catch (e) {
    return pc_err(e.toString() + ' (linha ' + e.line + ')');
  }
}

function pc_cloneAndOpen(seq, newName) {
  var before = {}, i;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    before[app.project.sequences[i].sequenceID] = true;
  }
  seq.clone();
  var found = null;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    var s = app.project.sequences[i];
    if (!before[s.sequenceID]) { found = s; break; }
  }
  if (!found) return null;
  try { found.name = newName; } catch (e1) {}
  try { app.project.openSequence(found.sequenceID); } catch (e2) {}
  var act = app.project.activeSequence;
  if (!act || act.sequenceID !== found.sequenceID) {
    try { app.project.activeSequence = found; } catch (e3) {}
    act = app.project.activeSequence;
  }
  if (!act || act.sequenceID !== found.sequenceID) return null;
  return act;
}

function pc_timecode(ticks, settings) {
  var t = new Time();
  t.ticks = String(Math.round(ticks));
  return t.getFormatted(settings.videoFrameRate, settings.videoDisplayFormat);
}

function pc_hasBoundaryAt(track, ticks, tol) {
  for (var c = 0; c < track.clips.numItems; c++) {
    if (Math.abs(parseFloat(track.clips[c].start.ticks) - ticks) <= tol) return true;
  }
  return false;
}

function pc_clipSpans(track, ticks) {
  for (var c = 0; c < track.clips.numItems; c++) {
    var it = track.clips[c];
    if (parseFloat(it.start.ticks) < ticks && parseFloat(it.end.ticks) > ticks) return true;
  }
  return false;
}

// payload: { clone, cloneName, tracks:[idx], cutFrames:[int], segments:[{s,e,track}] } (em frames)
function pc_applyCuts(payloadStr) {
  try {
    var p = eval('(' + payloadStr + ')');
    var seq = app.project.activeSequence;
    if (!seq) return pc_err('Nenhuma sequencia ativa.');
    var i, ti, ci;

    for (ti = 0; ti < p.tracks.length; ti++) {
      if (p.tracks[ti] >= seq.videoTracks.numTracks) return pc_err('A faixa V' + (p.tracks[ti] + 1) + ' nao existe nesta sequencia.');
      if (pc_isLocked(seq.videoTracks[p.tracks[ti]])) return pc_err('A faixa V' + (p.tracks[ti] + 1) + ' esta travada (cadeado). Destrave e tente de novo.');
    }

    if (p.clone) {
      seq = pc_cloneAndOpen(seq, p.cloneName);
      if (!seq) return pc_err('Nao consegui duplicar e abrir a sequencia. Desmarque "Duplicar sequencia" ou duplique manualmente.');
    }

    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return pc_err('QE: sequencia ativa nao encontrada.');

    var tb = parseFloat(seq.timebase);
    var settings = seq.getSettings();
    var zero = parseFloat(seq.zeroPoint) || 0;
    var offset = null; // descobre se o razor espera o timecode com o inicio da sequencia
    var razors = 0;

    for (ti = 0; ti < p.tracks.length; ti++) {
      var idx = p.tracks[ti];
      var track = seq.videoTracks[idx];
      var qt = qeSeq.getVideoTrackAt(idx);
      for (ci = 0; ci < p.cutFrames.length; ci++) {
        var ticks = p.cutFrames[ci] * tb;
        if (!pc_clipSpans(track, ticks)) continue; // ja existe corte ou nao ha clipe aqui
        if (offset === null) {
          qt.razor(pc_timecode(ticks + zero, settings));
          if (pc_hasBoundaryAt(track, ticks, tb / 2)) {
            offset = zero;
          } else {
            qt.razor(pc_timecode(ticks, settings));
            if (pc_hasBoundaryAt(track, ticks, tb / 2)) offset = 0;
            else return pc_err('O corte automatico (razor) nao funcionou nesta versao do Premiere.');
          }
        } else {
          qt.razor(pc_timecode(ticks + offset, settings));
        }
        razors++;
      }
    }

    // liga so a camera escolhida em cada trecho; desliga as outras
    var segs = p.segments;
    var findSeg = function (frame) {
      var lo = 0, hi = segs.length - 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (frame < segs[mid].s) hi = mid - 1;
        else if (frame >= segs[mid].e) lo = mid + 1;
        else return segs[mid];
      }
      return null;
    };

    var toggled = 0;
    for (ti = 0; ti < p.tracks.length; ti++) {
      var vIdx = p.tracks[ti];
      var vt = seq.videoTracks[vIdx];
      for (i = 0; i < vt.clips.numItems; i++) {
        var item = vt.clips[i];
        var midFrame = (parseFloat(item.start.ticks) + parseFloat(item.end.ticks)) / 2 / tb;
        var seg = findSeg(midFrame);
        if (!seg) continue;
        var shouldDisable = (seg.track !== vIdx);
        if (item.disabled !== shouldDisable) {
          item.disabled = shouldDisable;
          toggled++;
        }
      }
    }

    // marcadores nos trechos duvidosos, para conferir rapido
    var marked = 0;
    if (p.markers && p.markers.length) {
      for (i = 0; i < p.markers.length; i++) {
        try {
          var mk = seq.markers.createMarker(p.markers[i].t);
          mk.name = p.markers[i].name;
          mk.comments = p.markers[i].comment;
          try { mk.setColorByIndex(1); } catch (e4) {} // vermelho
          marked++;
        } catch (e5) {}
      }
    }

    return pc_json({ ok: true, sequence: seq.name, razors: razors, toggled: toggled, markers: marked });
  } catch (e) {
    return pc_err(e.toString() + ' (linha ' + e.line + ')');
  }
}
