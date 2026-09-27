-- 清理旧的内置示例，替换为 30 期精选常青库

DELETE FROM mini_program_contents;

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_001',
      'daily_spark',
      '今日探险金句',
      'Every small step makes a big adventure!',
      '每一次大胆开口，都是通往广阔世界的奇妙探险！',
      '💡 语感小贴士：small-step 与 big-adventure 连读自然连贯，不要刻意停顿哦。',
      '美式纯正原声 · 节奏欢快',
      'active',
      0
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_002',
      'daily_spark',
      '勇敢表达力量',
      'Mistakes are proof that you are trying!',
      '说错一点不可怕，这是勇敢尝试最酷的印记！',
      '💡 肢体引导：表达 trying 时配上大拇指 👍，孩子记忆会更加深刻。',
      '温柔鼓励语调 · 亲和耐心',
      'active',
      1
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_003',
      'daily_spark',
      '自信语感积累',
      'Practice brings progress, not just perfection!',
      '每天多开口说一点，自信和纯正语感自然水到渠成！',
      '💡 发音细节：practice 与 progress 的首音节轻重抑扬顿挫，极富律动感。',
      '自然对话语境 · 地道表达',
      'active',
      2
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_004',
      'daily_spark',
      '大自然好奇心',
      'Look closely at the stars, they are whispering!',
      '抬头看看漫天繁星，它们正向你悄悄眨眼呢！',
      '💡 慢速发音：whispering 的 wh 发微弱送气轻音，声音充满神秘童趣。',
      '自然轻柔音色 · 优美静心',
      'active',
      3
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_005',
      'daily_spark',
      '友谊与伙伴',
      'Kind words are like sunshine on a rainy day.',
      '温暖友善的语言，就像雨天里洒下的一束金色阳光。',
      '💡 韵律连读：words are 连成 /wɜːdzə/，sunshine 与 rainy 语调抑扬。',
      '温暖明朗音色 · 充满治愈',
      'active',
      4
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_006',
      'daily_spark',
      '小小科学家',
      'Ask a question, and the whole world opens up!',
      '提出一个好奇的问题，整个奇妙世界便向你敞开！',
      '💡 语调上扬：前半句 Ask a question 尾音轻微上扬，激发探索欲。',
      '好奇探险音调 · 活力四射',
      'active',
      5
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_007',
      'daily_spark',
      '晨起活力唤醒',
      'Good morning, sunshine! Today is full of magic.',
      '早安阳光！今天又是充满奇妙魔法的一天。',
      '💡 连音技巧：Good morning 自然流畅，magic 的末尾 /k/ 音轻促收口。',
      '元气满满原声 · 清新明快',
      'active',
      6
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_008',
      'daily_spark',
      '坚持与毅力',
      'You are braver than you believe and stronger than you seem.',
      '你远比自己想象的更勇敢，比自己看起来更强大！',
      '💡 经典语录出自小熊维尼，braver 与 stronger 重读，给予孩子强大自信。',
      '坚定鼓励音色 · 温暖有力',
      'active',
      7
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_009',
      'daily_spark',
      '音乐与韵律',
      'Sing like birds, speak like friends, dream like kings!',
      '像小鸟般欢歌，像朋友般交谈，像王者般做梦！',
      '💡 排比节奏：三个短句结构对称，speak like friends 语调自然平稳。',
      '戏剧舞台音感 · 朗朗上口',
      'active',
      8
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_010',
      'daily_spark',
      '想象力飞扬',
      'An open book is an open door to anywhere!',
      '打开一本有趣的书，就是推开通向任意奇妙世界的大门！',
      '💡 连读示范：open-an, door-to 自然滑音，如同推开魔法门的音效。',
      '亲切故事绘本音 · 生动绘声',
      'active',
      9
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_011',
      'daily_spark',
      '团队与分享',
      'Together, we can build castles in the sky.',
      '齐心协力，我们就能一起在云端搭建奇幻城堡。',
      '💡 发音注意：castles 中 t 不发音，读 /ˈkɑːslz/，注意英美音差异。',
      '伙伴互动音调 · 亲密愉悦',
      'active',
      10
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_012',
      'daily_spark',
      '善意小举动',
      'A warm smile is the universal language of kindness.',
      '一个灿烂温暖的微笑，是全世界通用的善意语言。',
      '💡 重音落在 universal 与 kindness，嘴角微笑时发音更圆润饱满。',
      '温柔优雅原声 · 纯正地道',
      'active',
      11
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_013',
      'daily_spark',
      '勇敢探索',
      'Don’t just fly, soar high into the clouds!',
      '不仅要勇敢扑打翅膀，更要直冲云霄自由翱翔！',
      '💡 动词对比：fly (轻飞) 与 soar (高翱)，发音时气息饱满悠长。',
      '飞跃动感音色 · 鼓舞人心',
      'active',
      12
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_014',
      'daily_spark',
      '探索大自然',
      'Every autumn leaf whispers a tale of change.',
      '每一片飘落的秋叶，都在轻声诉说着大自然的奇妙秘密。',
      '💡 拟声韵味：autumn leaf whispers，发音带有沙沙作响的宁静美感。',
      '原野自然原声 · 静谧美好',
      'active',
      13
    );

INSERT INTO mini_program_contents (
      id, type, theme, content_en, content_zh, tip, sound_desc, status, sort_order
    ) VALUES (
      'spark_015',
      'daily_spark',
      '自我肯定',
      'I am curious, I am kind, and I love to learn!',
      '我充满好奇，我心怀善意，我热爱探索新知！',
      '💡 每日宣誓句：适合孩子每天晨读，提升自信开口第一声的能量！',
      '自信童声引导 · 活泼灵动',
      'active',
      14
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_001',
      'culture_bite',
      '神秘午餐盒',
      '欧美小学生的 Lunchbox 里装些什么？',
      '不止是美味美食，还有藏在盒盖里的温情暗号',
      '经典标配是香甜的花生酱果酱三明治 (PB&J) 配一盒切片苹果与小彩虹胡萝卜。很多欧美爸爸妈妈还会在餐盒里悄悄塞一张手写小纸条：“You are awesome, have fun!”，给孩子一整天的暖心鼓励！',
      '🥪',
      '{"words":[{"en":"Lunchbox","zh":"午餐便当盒"},{"en":"Snack time","zh":"课间加餐时光"},{"en":"Kind note","zh":"手写鼓励便签"}]}',
      'active',
      0
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_002',
      'culture_bite',
      'Show & Tell',
      '什么是欧美课堂风靡的「Show & Tell」？',
      '带上最爱的宝藏，站上讲台成为自信小讲师',
      '每周一次的 Show and Tell 是孩子最期盼的环节！小朋友会从家里带一件自己最珍视的宝贝（亲手拼的乐高、海边捡的奇异贝壳），用生动自然的句子分享：“This is my treasure...” 从小锻炼公众表达与叙事魅力！',
      '🎒',
      '{"words":[{"en":"Show & Tell","zh":"实物分享表达课"},{"en":"Treasure","zh":"珍爱的小宝藏"},{"en":"Share story","zh":"大声自信讲故事"}]}',
      'active',
      1
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_003',
      'culture_bite',
      '伦敦双层车',
      '伦敦标志性红色双层巴士的「叮叮」暗号',
      '坐在二层看世界，下车前要按响神秘小按钮',
      '伦敦标志性的 Double-decker 红巴士有两层楼高！坐在顶层第一排就像在开过山车。如果想在下一站下车，只要轻轻按一下柱子上的红纽，清脆的“Ding Ding!”声就会通知司机叔叔停靠站台。',
      '🚌',
      '{"words":[{"en":"Double-decker","zh":"双层大巴士"},{"en":"Ring the bell","zh":"按响下车铃"},{"en":"Next stop","zh":"下一站抵达"}]}',
      'active',
      2
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_004',
      'culture_bite',
      '柠檬水小摊',
      '欧美孩子夏天的「Lemonade Stand」仪式',
      '在家门口摆小摊，学会第一次用英文做小生意',
      '阳光灿烂的夏日周末，欧美小朋友会亲手榨鲜柠檬汁，在自家草坪前支起木板摊。用彩色蜡笔写上“Fresh Lemonade 50¢”，大声招揽邻居：“Ice cold lemonade!”，赚来的小零钱常常捐给流浪动物救助站。',
      '🍋',
      '{"words":[{"en":"Lemonade stand","zh":"柠檬水小摊"},{"en":"Neighborhood","zh":"亲切邻里社区"},{"en":"Ice cold","zh":"冰凉解暑"}]}',
      'active',
      3
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_005',
      'culture_bite',
      '睡衣读书日',
      '欧美小学的「Pajama Reading Day」',
      '穿着毛绒睡衣去学校，抱着抱枕沉浸读绘本',
      '有些周五是狂欢睡衣日！校长和老师全部穿着恐龙、小熊睡衣来上班。教室地板上铺满地毯和彩色抱枕，关掉刺眼的吊灯，点亮小帐篷暖光，大家裹着小毯子喝着热可可，听老师绘声绘色读童话。',
      '📚',
      '{"words":[{"en":"Pajama party","zh":"趣味睡衣日"},{"en":"Hot cocoa","zh":"暖暖热可可"},{"en":"Cozy reading","zh":"惬意窝着阅读"}]}',
      'active',
      4
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_006',
      'culture_bite',
      '拼字小蜜蜂',
      '风靡全美的「Spelling Bee」拼词大战',
      '为什么比赛要叫“小蜜蜂”？考验拼读硬实力',
      '在英语里，“Bee”代表大家聚在一起做一件热热闹闹的事。比赛中裁判读出单词，小选手不能看纸笔，站在麦克风前大声拼出每一个字母：“B-E-C-A-U-S-E, because!”，非常锻炼自然拼读与即兴心理素质！',
      '🐝',
      '{"words":[{"en":"Spelling Bee","zh":"拼字挑战赛"},{"en":"Pronounce","zh":"标准清晰发音"},{"en":"Spell it out","zh":"逐字大声拼读"}]}',
      'active',
      5
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_007',
      'culture_bite',
      '篝火棉花糖',
      '美式露营必吃的「S’mores」到底是什么？',
      '烤得软糯拉丝的棉花糖，夹在饼干里的甜蜜味道',
      'S’mores 的名字其实是 “Some more”（还想再来一个！）的缩写。围坐在跳动的篝火旁，用树枝串着棉花糖烤到金黄焦香，夹在两块全麦饼干与巧克力块中间一压，热气瞬间把巧克力融化，香甜无比！',
      '🏕️',
      '{"words":[{"en":"Campfire","zh":"温暖营地篝火"},{"en":"Marshmallow","zh":"软糯棉花糖"},{"en":"Some more","zh":"再来一口！"}]}',
      'active',
      6
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_008',
      'culture_bite',
      '万圣节敲门',
      '不给糖就捣蛋！真实「Trick or Treat」礼仪',
      '提着小南瓜桶敲门时，西方孩子有哪些礼貌暗号？',
      '万圣节夜晚，小朋友装扮成小宇航员或超级英雄。敲开挂满南瓜灯的邻居家门后，一定要等主人开门微笑，大声说“Trick or treat!”。拿到糖果后，必说清脆的一句“Thank you and Happy Halloween!”才算合格小绅士小淑女！',
      '🎃',
      '{"words":[{"en":"Jack-o-lantern","zh":"南瓜笑脸灯"},{"en":"Costume","zh":"节日奇趣盛装"},{"en":"Polite words","zh":"礼貌问答习惯"}]}',
      'active',
      7
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_009',
      'culture_bite',
      '科学博览会',
      '欧美小学的「Science Fair」火山爆发秀',
      '小发明家的大擂台，用火山喷发探索化学魔力',
      '体育馆摆满了三折白板（Tri-fold board）！孩子们亲手做小实验：用小苏打加食用醋制造红色泡沫“火山喷发”、用土豆发电点亮小灯泡。向参观的家长评委自信讲解假设与实验结论，从小培养逻辑思维！',
      '🔬',
      '{"words":[{"en":"Science Fair","zh":"校园科学展览"},{"en":"Volcano","zh":"彩色模拟火山"},{"en":"Experiment","zh":"动手科学实验"}]}',
      'active',
      8
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_010',
      'culture_bite',
      '美式打招呼',
      '击掌「High-five」与撞拳「Fist Bump」',
      '除了说 Hello，英语母语小朋友怎样酷酷打招呼？',
      '在操场或球场上，当同伴投进一个漂亮的三分球，大家会高高举起右手大喊“High five!”清脆击掌；如果完成了一个合作小任务，两人会轻轻撞拳说一句“You rock!”（你太棒了！），瞬间拉近彼此距离。',
      '✋',
      '{"words":[{"en":"High five","zh":"空中击掌欢呼"},{"en":"Fist bump","zh":"帅气碰拳致意"},{"en":"You rock","zh":"你太厉害啦！"}]}',
      'active',
      9
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_011',
      'culture_bite',
      '后院小树屋',
      '许多欧美孩子梦想的「Treehouse」秘密基地',
      '建在老橡树上的木屋，藏着童年所有天马行空',
      '在欧美电影里常看到庭院树屋。爸爸妈妈会帮孩子用木板在坚固的大树枝丫间搭一间带小窗户的木屋。顺着绳梯爬上去，上面摆着手电筒、漫画书和望远镜，是好朋友们密谋探险计划的专属秘密基地。',
      '🏠',
      '{"words":[{"en":"Treehouse","zh":"后院绿色树屋"},{"en":"Rope ladder","zh":"摇晃小绳梯"},{"en":"Secret club","zh":"童年秘密基地"}]}',
      'active',
      10
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_012',
      'culture_bite',
      '亮黄色校车',
      '为什么美国校车都是一模一样的亮黄色？',
      '它拥有与警车同级别的路权，甚至装有停靠红牌',
      '这种独特的颜色在国际上被称为“国家学校巴士黄 (School Bus Yellow)”。清晨在微光或大雾中辨识度极高。当黄色校车停下伸出侧面的红色“STOP”小牌子时，周围所有车辆必须完全刹停，等待小朋友安全过马路！',
      '🚌',
      '{"words":[{"en":"School bus","zh":"亮黄色大校车"},{"en":"Stop sign","zh":"伸缩停车警示牌"},{"en":"Safety first","zh":"安全永远第一"}]}',
      'active',
      11
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_013',
      'culture_bite',
      '跨洋笔友信',
      '写一封跨越重洋的「Pen Pal」信件',
      '在数字时代，手写英文信件依然充满魔力',
      '很多国际学校鼓励孩子结交海外 Pen Pal（笔友）。一笔一划在带有可爱图案的信纸上写下：“Hi from Shanghai! My dog is fluffy and loves soccer...” 贴上漂亮的国际航空邮票，等待大洋彼岸回信的几个星期，每一次拆信都像拆礼物！',
      '✉️',
      '{"words":[{"en":"Pen pal","zh":"远方交流笔友"},{"en":"Stamp","zh":"国际纪念邮票"},{"en":"Handwritten","zh":"手写真挚文字"}]}',
      'active',
      12
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_014',
      'culture_bite',
      '火鸡大奔跑',
      '感恩节全家狂欢的「Turkey Trot」跑',
      '吃烤火鸡之前，戴着滑稽火鸡帽晨跑 5 公里',
      '感恩节早晨，全美许多社区都会举行 Turkey Trot 趣味路跑。全家老小齐上阵，大家头上戴着扑棱棱的火鸡羽毛头饰，甚至推着婴儿车慢跑。跑完全程不仅锻炼身体，还会把参赛费变成食物礼包送给需要帮助的人！',
      '🦃',
      '{"words":[{"en":"Thanksgiving","zh":"感恩温暖节日"},{"en":"Turkey Trot","zh":"火鸡趣味晨跑"},{"en":"Grateful heart","zh":"常怀感恩之心"}]}',
      'active',
      13
    );

INSERT INTO mini_program_contents (
      id, type, theme, title, subtitle, content_zh, icon, metadata, status, sort_order
    ) VALUES (
      'culture_015',
      'culture_bite',
      '操场四方球',
      '下课铃响必冲的「Four Square」四方球',
      '只需粉笔和皮球，就能让整个操场欢呼沸腾',
      '在操场水泥地上用粉笔画出 1, 2, 3, 4 四个大方格。四个人站在各自格子里用手掌击打弹地皮球，球只能在自己格子里弹起一次并拍给别人。没有复杂的装备，却能让课间 15 分钟充满欢声笑语！',
      '🎈',
      '{"words":[{"en":"Four square","zh":"四方格子弹球"},{"en":"Recess","zh":"课间休息玩耍"},{"en":"Bounce ball","zh":"手掌轻拍皮球"}]}',
      'active',
      14
    );