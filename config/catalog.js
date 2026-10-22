// Project-designed balance pending comparison with the missing V1.7 documents.
export const RULES = Object.freeze({ teamLimit:4, affixLimit:4, maxLevel:3, armorDuration:12, bosses:[95,180,270], enemyLimit:24, bulletLimit:220, particleLimit:90 });
export const ROLES = {
 assault:{name:'突击',weapon:'rifle',hp:62,interval:.72,damage:9,color:'#70edff'},
 heavy:{name:'重火力',weapon:'machine',hp:78,interval:.36,damage:6,color:'#ffce85'},
 guard:{name:'护卫',weapon:'shotgun',hp:108,interval:1.3,damage:7,color:'#a2e9c2'},
};
export const PETS = {
 dragon:{name:'烈焰幼龙',icon:'炎',color:'#ffb173',cooldown:6,description:'每6秒喷焰；伤害 +6% / 级'},
 owl:{name:'电磁夜枭',icon:'电',color:'#b6a2ff',cooldown:7,description:'每7秒电磁脉冲；敌方伤害降低'},
 drone:{name:'守护机灵',icon:'盾',color:'#7fe5ff',cooldown:8,description:'每8秒补充护盾；护盾容量有限'},
 fairy:{name:'生命精灵',icon:'愈',color:'#a2f5c3',cooldown:9,description:'每9秒治疗主角与队员'},
};
export const ARMORS = {
 thunder:{name:'雷霆战甲',color:'#a8a1ff',damage:1.22,rate:1.15,description:'闪电链击 · 护甲减伤'},
 molten:{name:'熔火战甲',color:'#ffac76',damage:1.4,rate:1,description:'灼烧弹芯 · 火力爆发'},
 phantom:{name:'幻影战甲',color:'#75f5e2',damage:1.12,rate:1.4,description:'高速供弹 · 灵动防护'},
};
export const AFFIXES = [
 ['volley','平行轨道','弹幕','弹道 +1 / 级，上限5'],
 ['burst','复式弹链','弹幕','追加弹丸 +2 / 级，上限8'],
 ['haste','疾速供弹','弹幕','射速 +12% / 级'],
 ['velocity','磁轨加速','弹幕','弹速 +18% / 级'],
 ['burn','灼热弹芯','元素','命中灼烧3秒；每秒伤害 3 / 级'],
 ['frost','低温凝滞','元素','命中减速 12% / 级，持续2秒'],
 ['arc','连锁电弧','元素','每0.7秒向最多2个相邻敌人传导 22% / 级伤害'],
 ['blast','冲击余波','元素','每0.7秒对附近敌人造成 18% / 级伤害'],
 ['rally','交叉火力','编队','队员伤害 +15% / 级'],
 ['drill','协同训练','编队','队员射速 +12% / 级'],
 ['medic','战地医护','编队','每6秒恢复队员 2 / 级生命'],
 ['laststand','背水一战','编队','主角生命低于35时，团队伤害 +20% / 级'],
 ['plating','复合装甲','生存','团队承伤 -8% / 级，上限24%'],
 ['recovery','纳米再生','生存','每6秒恢复主角 2 / 级生命'],
 ['barrier','周期屏障','生存','每8秒补充 5 / 级护盾，有容量上限'],
 ['salvage','战场回收','生存','击杀恢复 1 / 级生命，冷却2.5秒'],
 ['overclock','超频核心','科技','过载期间额外伤害 +10% / 级'],
 ['capacitor','护盾电容','科技','护盾容量 +8 / 级，获得时补充等量护盾'],
 ['execution','弱点扫描','科技','对生命低于30%的目标增伤 +20% / 级'],
 ['magnet','磁力回收','科技','补给横向拾取范围 +0.2 / 级'],
].map(([id,name,category,description])=>({id,name,category,description}));
