// 数据来源：https://wiki.biligame.com/rocom/克制计算器
// strong   = 攻击这些防御属性效果好 ×2
// weak     = 攻击这些防御属性效果差 ×0.5
// resist   = 自身作为防御方时，抵抗这些攻击属性 ×0.5
// vulnerable = 自身作为防御方时，对这些攻击属性弱 ×2
// immune   = 预留字段，当前游戏数据无免疫关系
const TYPE_CHART = {
  '普通': { strong: [],                        weak: ['武'],                        resist: ['地','幽','机械'],                              vulnerable: ['幽'],                                      immune: [] },
  '草':   { strong: ['水','光','地'],           weak: ['火','冰','毒','虫','翼'],    resist: ['火','龙','毒','虫','翼','机械'],                vulnerable: ['水','地','电','光'],                       immune: [] },
  '火':   { strong: ['草','冰','虫','机械'],    weak: ['水','地'],                   resist: ['水','地','龙'],                                 vulnerable: ['草','冰','虫','萌','机械'],                immune: [] },
  '水':   { strong: ['火','地','机械'],         weak: ['草','电'],                   resist: ['草','冰','龙'],                                 vulnerable: ['火','机械'],                               immune: [] },
  '光':   { strong: ['幽','恶'],               weak: ['草','幽'],                   resist: ['草','冰'],                                      vulnerable: ['恶','幻'],                                 immune: [] },
  '地':   { strong: ['火','冰','电','毒'],      weak: ['草','水','冰','武','机械'],  resist: ['草','武'],                                      vulnerable: ['普通','火','电','毒','翼'],                immune: [] },
  '冰':   { strong: ['草','地','龙','翼'],      weak: ['火','地','武','机械'],       resist: ['火','冰','机械'],                               vulnerable: ['水','冰','光'],                            immune: [] },
  '龙':   { strong: ['龙'],                    weak: ['冰','龙','萌'],              resist: ['机械'],                                         vulnerable: ['草','火','水','电','翼'],                  immune: [] },
  '电':   { strong: ['水','翼'],               weak: ['地'],                        resist: ['草','地','龙','电'],                            vulnerable: ['电','翼','机械'],                          immune: [] },
  '毒':   { strong: ['草','萌'],               weak: ['地','恶','幻'],              resist: ['地','毒','幽','机械'],                          vulnerable: ['草','毒','虫','武','萌'],                  immune: [] },
  '虫':   { strong: ['草','恶','幻'],          weak: ['火','翼'],                   resist: ['火','毒','武','翼','萌','幽','机械'],           vulnerable: ['草','武'],                                 immune: [] },
  '武':   { strong: ['普通','地','冰','恶','机械'], weak: ['翼','萌','幻'],         resist: ['毒','虫','翼','萌','幽','幻'],                  vulnerable: ['地','虫','恶'],                            immune: [] },
  '翼':   { strong: ['草','虫','武'],          weak: ['冰','电'],                   resist: ['地','龙','电','机械'],                          vulnerable: ['草','虫','武'],                            immune: [] },
  '萌':   { strong: ['龙','武','恶'],          weak: ['毒','恶','机械'],            resist: ['火','毒','机械'],                               vulnerable: ['虫','武'],                                 immune: [] },
  '幽':   { strong: ['光','幽','幻'],          weak: ['光','幽','恶'],              resist: ['普通','恶'],                                    vulnerable: ['普通','毒','虫','武'],                     immune: [] },
  '恶':   { strong: ['毒','萌','幽'],          weak: ['光','虫','武','萌'],         resist: ['光','武','恶'],                                 vulnerable: ['幽','恶'],                                 immune: [] },
  '机械': { strong: ['地','冰','萌'],          weak: ['火','水','武'],              resist: ['火','水','电','机械'],                          vulnerable: ['普通','草','冰','龙','毒','虫','翼','萌','机械','幻'], immune: [] },
  '幻':   { strong: ['毒','武'],               weak: ['虫','幽'],                   resist: ['光','机械','幻'],                               vulnerable: ['武','幻'],                                 immune: [] },
};

const TYPE_COLORS = {
  '普通':'#9e9e9e','草':'#66bb6a','火':'#ef5350','水':'#42a5f5',
  '光':'#ffcc02','地':'#a1887f','冰':'#80deea','龙':'#7c4dff',
  '电':'#ffca28','毒':'#ab47bc','虫':'#9ccc65','武':'#ef9a9a',
  '翼':'#81d4fa','萌':'#f48fb1','幽':'#5c6bc0','恶':'#6d4c41',
  '机械':'#78909c','幻':'#ce93d8',
};
const TYPE_TEXT_DARK = new Set(['光','冰','电','武','翼','萌','幽','幻']);

// 属性图标（来源：https://wiki.biligame.com/nrc/ ，BWiki patchwiki 图床原图，约 55×56）
const TYPE_ICONS = {
  '普通': 'https://patchwiki.biligame.com/images/nrc/3/35/b0gigz0reegycqg40ik3jayo5vhi4m1.png',
  '草':   'https://patchwiki.biligame.com/images/nrc/b/b8/8fh2oym6ldwadc3qr2ynh2d8ramdqwp.png',
  '火':   'https://patchwiki.biligame.com/images/nrc/5/56/0nfa46urnn7qjjhanyjvj1hq3n6ady6.png',
  '水':   'https://patchwiki.biligame.com/images/nrc/7/73/43q0k2tn3u1qow3unucnvwx4p3ruycu.png',
  '光':   'https://patchwiki.biligame.com/images/nrc/e/eb/5d81xmmo6mwavqvbdhp1xevcp5e2rrq.png',
  '地':   'https://patchwiki.biligame.com/images/nrc/c/cf/sydcj72coawh39cyebnb8wiadq4d7a1.png',
  '冰':   'https://patchwiki.biligame.com/images/nrc/5/54/tw7z68vd0r2fivv5i72y80wicgfifxk.png',
  '龙':   'https://patchwiki.biligame.com/images/nrc/c/c9/07lk3hkjg5585rpbxjev3864e7zz4vj.png',
  '电':   'https://patchwiki.biligame.com/images/nrc/0/05/74v3mn737sst6nyhu1qx0f9nx9z7cnf.png',
  '毒':   'https://patchwiki.biligame.com/images/nrc/a/a5/nsgv1ypvaylyeg7pj3b4zsht16j5i0l.png',
  '虫':   'https://patchwiki.biligame.com/images/nrc/8/8b/1f6jbb1cq4gkas862yg5xzoupu21vgh.png',
  '武':   'https://patchwiki.biligame.com/images/nrc/a/a7/pr4f0yt60heec1o0ghwex1ov91obz9s.png',
  '翼':   'https://patchwiki.biligame.com/images/nrc/8/82/3izgedbios6n3xaui4whtwp5oytikf2.png',
  '萌':   'https://patchwiki.biligame.com/images/nrc/6/6a/mj0letus7ogg5un813ogfg8egg7lmt5.png',
  '幽':   'https://patchwiki.biligame.com/images/nrc/7/7f/hws03uwn2esdbipchpb495tolpedud9.png',
  '恶':   'https://patchwiki.biligame.com/images/nrc/4/47/sqaucq4ijmrt8zb5wpl5btbqzvg9rkb.png',
  '机械': 'https://patchwiki.biligame.com/images/nrc/b/b0/ectmfcsmc17y6gc9f9jpjrusme2zzo4.png',
  '幻':   'https://patchwiki.biligame.com/images/nrc/a/a7/1regqkg6b5skl52c69w2rz48biu158j.png',
};

const ALL_TYPES = ['普通','草','火','水','光','地','冰','龙','电','毒','虫','武','翼','萌','幽','恶','机械','幻'];
