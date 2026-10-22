"""Summarize measured combat intervals; never turn diagnostics into survival results."""
import csv,json,statistics
from pathlib import Path
root=Path(__file__).resolve().parents[1]
dir=root/'test-results/horde'
p=json.loads((dir/'balance-results.json').read_text())
rows=[]
for case in p['summary']:
 runs=[r for r in p['runs'] if all(r.get(k)==case.get(k) for k in ['skill','build','loadout','team'])]
 prev_time=0
 for end in [30,60,90,150,210,270,300]:
  metrics=[];alive=0
  for r in runs:
   if r['seconds']>=end or (end==300 and r['alive'] and r['seconds']>=299.7): alive+=1
   if r['seconds']<=prev_time:continue
   before=max([s for s in r['samples'] if s['time']<=prev_time+.15],key=lambda s:s['time'],default={'killed':0,'killSeconds':0,'engagementSeconds':0,'directHits':0,'breachHits':0,'damageTaken':0})
   candidates=[s for s in r['samples'] if s['time']<=end+.15]
   # Ended runs contribute their actual end counters; survivors use stage snapshots.
   after=r['final'] if r['seconds']<end+.3 else max(candidates,key=lambda s:s['time'],default=r['final'])
   if after['time']<prev_time:continue
   kills=after['killed']-before['killed']
   metrics.append({'live':after['alive'],'kills':kills,'age':after['killSeconds']-before['killSeconds'],'engaged':after['engagementSeconds']-before['engagementSeconds'],'hits':after['directHits']-before['directHits'],'breachHits':after['breachHits']-before['breachHits'],'damage':after['damageTaken']-before['damageTaken'],'stats':after['stats'],'boss':r['final']['bossFights']})
  kills=sum(m['kills'] for m in metrics)
  duration=[b['ended']-b['started'] for m in metrics for b in m['boss'] if b['ended'] is not None and prev_time<b['ended']<=end+.15]
  rows.append({**{k:case.get(k,'') for k in ['skill','build','loadout','team']},'fromSeconds':prev_time,'toSeconds':end,'cohortN':len(runs),'runsEnteringStage':len(metrics),'aliveAtBoundary':int(alive),'survivalFraction':alive/len(runs),'meanLiveEnemiesAtObservedEndpoint':statistics.mean(m['live'] for m in metrics) if metrics else None,'killsInStage':kills,'meanSpawnToDeathSeconds':sum(m['age'] for m in metrics)/kills if kills else None,'meanFirstHitToDeathSeconds':sum(m['engaged'] for m in metrics)/kills if kills else None,'meanDirectHitsInStage':statistics.mean(m['hits'] for m in metrics) if metrics else None,'meanBreachPenaltiesInStage':statistics.mean(m['breachHits'] for m in metrics) if metrics else None,'meanDamageTakenInStage':statistics.mean(m['damage'] for m in metrics) if metrics else None,'meanLanes':statistics.mean(m['stats']['lanes'] for m in metrics) if metrics else None,'meanPellets':statistics.mean(m['stats']['pellets'] for m in metrics) if metrics else None,'meanRateMultiplier':statistics.mean(m['stats']['fireRate'] for m in metrics) if metrics else None,'meanDamageMultiplier':statistics.mean(m['stats']['damage'] for m in metrics) if metrics else None,'meanBulletSpeedMultiplier':statistics.mean(m['stats']['bulletSpeed'] for m in metrics) if metrics else None,'bossKillsInStage':len(duration),'meanBossFightSeconds':statistics.mean(duration) if duration else None})
  prev_time=end
with (dir/'stage-summary.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
(dir/'stage-summary.json').write_text(json.dumps({'method':'Interval counters; runs dying within a stage contribute at death. Enemy mean is at measured endpoint, not a continuous stage mean. Survival denominator is initial cohort; post-death stages have no measurements. First-hit TTK is distinct from spawn travel time. Tiny 3-seed cohorts and deterministic controllers are not human win rates. End observations around299.8s due draft iterations are classified in300s tolerance0.3s; actual seconds retained.', 'rows':rows},ensure_ascii=False,indent=2))
print('Wrote',len(rows),'stage rows')
