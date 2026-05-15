// ============================================================
//  華夏風雲錄 — cards.js
//
//  Copyright © 2026 linus622wang@gmail.com
//  All Rights Reserved.
//
//  未經開發者 linus622wang@gmail.com 書面授權，
//  嚴禁任何形式的複製、修改、散佈或商業使用。
//  Unauthorized copying, modification, distribution,
//  or commercial use of this file is strictly prohibited.
// ============================================================

const cardDatabase = [
    // === 君王(主公) ===
    { id: "m01", name: "商湯", type: "君王", dynasty: "商", hp: 5, maxHp: 5, symbolItem: "玉圭", img: "assets/monarchs/m01.png", desc: "商朝開國君主，網開一面，仁德服人。", skillName: "網開一面", skillDesc: "被動技：受到致命傷害時，有 50% 機率強行保留 1 滴血不死。" },
    { id: "m02", name: "周武王", type: "君王", dynasty: "周", hp: 5, maxHp: 5, img: "assets/monarchs/m02.jpg", desc: "西周開國君主，伐紂滅商，建立周朝。", skillName: "天命", skillDesc: "鎖定技：只要武王在場，己方將軍打出的突擊傷害 +1。" },
    { id: "m03", name: "秦始皇", type: "君王", dynasty: "秦", hp: 5, maxHp: 5, symbolItem: "太阿劍", img: "assets/monarchs/m03.jpg", desc: "中國首位皇帝，統一天下，車同軌書同文。", skillName: "萬里長城", skillDesc: "鎖定技：只要秦始皇存活，己方的「後營區」武將免疫一切魔法破壞與傷害。" },
    { id: "m04", name: "漢高祖劉邦", type: "君王", dynasty: "漢", hp: 5, maxHp: 5, img: "assets/monarchs/m04.png", desc: "西漢開國皇帝，知人善任，布衣將相。", skillName: "知人善任", skillDesc: "被動技：每當成功放置一名武將到場上，己方主公恢復 1 點血量。" },
    { id: "m05", name: "漢武帝劉徹", type: "君王", dynasty: "漢", hp: 5, maxHp: 5, img: "assets/monarchs/m05.png", desc: "西漢鼎盛時期的皇帝，罷黜百家獨尊儒術。", skillName: "雄才大略", skillDesc: "被動技：回合開始時若手牌少於 2 張，可額外抽取 2 張牌。" },
    { id: "m06", name: "光武帝劉秀", type: "君王", dynasty: "漢", hp: 5, maxHp: 5, img: "assets/monarchs/m06.jpg", desc: "東漢開國皇帝，位面之子，昆陽之戰大破新莽軍。", skillName: "大隕石術", skillDesc: "被動技：每回合受到首次攻擊時，召喚天火直接對敵方主公造成 1 點傷害！" },
    { id: "m07", name: "魏武帝曹操", type: "君王", dynasty: "三國(魏)", hp: 5, maxHp: 5, img: "assets/monarchs/m07.jpg", desc: "亂世之奸雄，挾天子以令諸侯。", skillName: "奸雄", skillDesc: "被動技：每當曹操受到傷害，隨機丟棄對手一張手牌。" },
    { id: "m08", name: "漢昭烈帝劉備", type: "君王", dynasty: "三國(蜀)", hp: 5, maxHp: 5, img: "assets/monarchs/m08.png", desc: "蜀漢開國皇帝，弘毅寬厚，知人待士。", skillName: "仁德", skillDesc: "被動技：回合結束時，若手牌大於體力值，可選擇將多餘手牌分配給場上的部將轉化為血量。" },
    { id: "m09", name: "吳大帝孫權", type: "君王", dynasty: "三國(吳)", hp: 5, maxHp: 5, img: "assets/monarchs/m09.png", desc: "東吳霸主，生子當如孫仲謀。", skillName: "制衡", skillDesc: "被動技：每當使用「計策卡」時，有 50% 機率再抽一張牌。" },
    { id: "m10", name: "隋文帝楊堅", type: "君王", dynasty: "隋", hp: 5, maxHp: 5, img: "assets/monarchs/m10.jpg", desc: "結束南北朝亂世，開創開皇之治。", skillName: "開皇之治", skillDesc: "被動技：只要在場，每回合我方所有文臣恢復 1 點血量。" },
    { id: "m11", name: "唐太宗李世民", type: "君王", dynasty: "唐", hp: 5, maxHp: 5, img: "assets/monarchs/m11.png", desc: "貞觀之治開創者，天可汗。", skillName: "天可汗", skillDesc: "鎖定技：無懼任何兵器，李世民受到的所有傷害強制-1。" },
    { id: "m12", name: "武則天", type: "君王", dynasty: "唐(武周)", hp: 5, maxHp: 5, img: "assets/monarchs/m12.png", desc: "中國歷史上唯一的正統女皇帝。", skillName: "日月當空", skillDesc: "被動技：每次敵軍下怪時，有 20% 機率直接誘降並丟進墳場。" },
    { id: "m13", name: "宋太祖趙匡胤", type: "君王", dynasty: "宋", hp: 5, maxHp: 5, img: "assets/monarchs/m13.jpg", desc: "杯酒釋兵權，黃袍加身。", skillName: "黃袍加身", skillDesc: "鎖定技：回合開始時可以直接將手牌中的一張裝備/事件卡轉換為【固守】。" },
    { id: "m14", name: "元太祖成吉思汗", type: "君王", dynasty: "元", hp: 5, maxHp: 5, img: "assets/monarchs/m14.png", desc: "一代天驕，蒙古帝國奠基者。", skillName: "蒙古鐵騎", skillDesc: "鎖定技：己方所有大將軍的突擊必定額外連擊一次。" },
    { id: "m15", name: "明太祖朱元璋", type: "君王", dynasty: "明", hp: 5, maxHp: 5, img: "assets/monarchs/m15.jpg", desc: "乞丐皇帝，驅逐韃虜恢復中華。", skillName: "鐵腕", skillDesc: "被動技：一旦有敵方武將陣亡，朱元璋立刻恢復 2 點血量。" },
    { id: "m16", name: "明成祖朱棣", type: "君王", dynasty: "明", hp: 5, maxHp: 5, img: "assets/monarchs/m16.jpg", desc: "五征漠北，鄭和下西洋，永樂盛世。", skillName: "靖難", skillDesc: "被動技：當受到突擊時，立刻從手牌打出一張突擊作為反擊。" },
    { id: "m17", name: "清聖祖康熙", type: "君王", dynasty: "清", hp: 5, maxHp: 5, img: "assets/monarchs/m17.png", desc: "平三藩、收台灣、抗擊沙俄。", skillName: "削藩", skillDesc: "被動技：每當擊殺一名敵方將領，強制拆除對手後營區的一名文臣。" },
    { id: "m18", name: "清高宗乾隆", type: "君王", dynasty: "清", hp: 5, maxHp: 5, img: "assets/monarchs/m18.jpg", desc: "十全武功，康乾盛世的巔峰。", skillName: "十全武功", skillDesc: "鎖定技：開局額外攜帶兩張突擊卡進入手牌。" },

    // === 大將軍/統帥 ===
    { id: "c01", name: "白起", type: "大將軍", dynasty: "秦", hp: 4, maxHp: 4, img: "assets/generals/c01.png", desc: "戰國四大名將之首，人稱殺神。", skillName: "坑殺", skillDesc: "被動技：發起突擊若擊殺目標，直接對敵方主公造成 1 點傷害。" },
    { id: "c02", name: "王翦", type: "大將軍", dynasty: "秦", hp: 4, maxHp: 4, img: "assets/generals/c02.jpg", desc: "戰國四大名將之一，滅楚功臣。", skillName: "穩紮穩打", skillDesc: "被動技：每回合初自動恢復 1 點血量。" },
    { id: "c03", name: "韓信", type: "大將軍", dynasty: "漢", hp: 4, maxHp: 4, symbolItem: "兵符", img: "assets/generals/c03.jpg", desc: "漢初三傑之一，兵仙，韓信點兵多多益善。", skillName: "多多益善", skillDesc: "被動技：若韓信在場，己方回合的抽牌階段額外抽 1 張牌。" },
    { id: "c04", name: "衛青", type: "大將軍", dynasty: "漢", hp: 4, maxHp: 4, img: "assets/generals/c04.jpg", desc: "西漢名將，七擊匈奴，收復河朔。", skillName: "長驅直入", skillDesc: "鎖定技：不受地形與陣型限制，可直接攻擊對手後營區。" },
    { id: "c05", name: "霍去病", type: "大將軍", dynasty: "漢", hp: 4, maxHp: 4, img: "assets/generals/c05.jpg", desc: "封狼居胥，驃騎將軍，匈奴未滅何以家為。", skillName: "封狼居胥", skillDesc: "被動技：發起攻擊時有 50% 機率直接秒殺生命值 ≤ 2 的敵將。" },
    { id: "c06", name: "周瑜", type: "大將軍", dynasty: "三國(吳)", hp: 4, maxHp: 4, symbolItem: "羽扇", img: "assets/generals/c06.png", desc: "赤壁之戰總指揮，羽扇綸巾談笑間。", skillName: "火燒赤壁", skillDesc: "被動技：發起突擊時附帶火攻效果，相鄰的敵軍武將同時受到 1 點傷害。" },
    { id: "c07", name: "陸遜", type: "大將軍", dynasty: "三國(吳)", hp: 4, maxHp: 4, img: "assets/generals/c07.png", desc: "夷陵之戰火燒連營，大敗劉備。", skillName: "火燒連營", skillDesc: "被動技：敵方主公每次受傷，陸遜自動對敵方隨機一武將追加 1 點傷害。" },
    { id: "c08", name: "李靖", type: "大將軍", dynasty: "唐", hp: 4, maxHp: 4, img: "assets/generals/c08.jpg", desc: "大唐軍神，滅東突厥、吐谷渾。", skillName: "六軍鏡", skillDesc: "鎖定技：在場時，己方全體武將最大血量 +1。" },
    { id: "c09", name: "蘇定方", type: "大將軍", dynasty: "唐", hp: 4, maxHp: 4, img: "assets/generals/c09.png", desc: "前後滅三國，皆生擒其主。", skillName: "生擒", skillDesc: "被動技：擊敗敵將時，將該敵將從陣地移入我方手牌中。" },
    { id: "c10", name: "郭子儀", type: "大將軍", dynasty: "唐", hp: 4, maxHp: 4, img: "assets/generals/c10.jpg", desc: "平定安史之亂，再造大唐的功臣。", skillName: "再造", skillDesc: "被動技：陣亡時，下回合自動滿血復活，全場限一次。" },
    { id: "c11", name: "岳飛", type: "大將軍", dynasty: "宋", hp: 4, maxHp: 4, img: "assets/generals/c11.png", desc: "精忠報國，撼山易撼岳家軍難。", skillName: "精忠報國", skillDesc: "鎖定技：當我方主公血量低於 3 滴時，岳飛攻擊力翻倍(突擊造成 2 點傷害)。" },
    { id: "c12", name: "韓世忠", type: "大將軍", dynasty: "宋", hp: 4, maxHp: 4, img: "assets/generals/c12.png", desc: "南宋中興四將之一，黃天蕩之戰。", skillName: "水戰", skillDesc: "被動技：無視對手打出的第一張「固守」。" },
    { id: "c13", name: "徐達", type: "大將軍", dynasty: "明", hp: 4, maxHp: 4, img: "assets/generals/c13.png", desc: "明朝開國第一功臣，萬里長城徐達第一。", skillName: "築城", skillDesc: "鎖定技：在場時，我方受到的每一次突擊有 30% 機率直接抵消。" },
    { id: "c14", name: "常遇春", type: "大將軍", dynasty: "明", hp: 4, maxHp: 4, img: "assets/generals/c14.png", desc: "常十萬，自言將十萬眾橫行天下。", skillName: "強襲", skillDesc: "被動技：打出「突擊」後，可再從抽牌堆抽一張牌。" },
    { id: "c15", name: "藍玉", type: "大將軍", dynasty: "明", hp: 4, maxHp: 4, img: "assets/generals/c15.png", desc: "捕魚兒海之役大破北元。", skillName: "破陣", skillDesc: "被動技：每一次成功命中，會強制棄掉對手牌庫頂的一張牌。" },
    { id: "c16", name: "多爾袞", type: "大將軍", dynasty: "清", hp: 4, maxHp: 4, img: "assets/generals/c16.jpg", desc: "清朝皇父攝政王，帶領清軍入關。", skillName: "攝政", skillDesc: "鎖定技：在場時可替代主公承受所有直接的傷害卡效果。" },
    { id: "c17", name: "趙奢", type: "大將軍", dynasty: "趙", hp: 4, maxHp: 4, img: "assets/generals/c17.png", desc: "戰國名將，閼與之戰大敗秦軍。", skillName: "狹路相逢", skillDesc: "被動技：當與對手武將 1 對 1 對戰時，攻擊力必定命中且暴擊。" },

    // === 將軍/猛將 ===
    { id: "g01", name: "蒙恬", type: "將軍", dynasty: "秦", hp: 4, maxHp: 4, desc: "卻匈奴七百餘里，胡人不敢南下而牧馬。", skillName: "卻胡", skillDesc: "鎖定技：對手無法從棄牌堆回收卡片。" },
    { id: "g02", name: "項羽", type: "將軍", dynasty: "楚", hp: 4, maxHp: 4, desc: "西楚霸王，羽之神勇千古無二。", skillName: "霸王", skillDesc: "鎖定技：項羽發起的突擊「無法被固守閃避」，強制造成傷害。" },
    { id: "g03", name: "張飛", type: "將軍", dynasty: "三國(蜀)", hp: 4, maxHp: 4, desc: "萬人敵，長板橋上一聲大喝嚇退百萬曹軍。", skillName: "咆哮", skillDesc: "被動技：不受每回合出牌限制，手牌若有突擊可無限次數發動。" },
    { id: "g04", name: "關羽", type: "將軍", dynasty: "三國(蜀)", hp: 4, maxHp: 4, desc: "武聖，過五關斬六將，威震華夏。", skillName: "武聖", skillDesc: "被動技：可將手中任何紅色的卡(如休整)當作突擊打出。" },
    { id: "g05", name: "趙雲", type: "將軍", dynasty: "三國(蜀)", hp: 4, maxHp: 4, desc: "常山趙子龍，長坂坡七進七出救阿斗。", skillName: "龍膽", skillDesc: "被動技：當受到攻擊時，可以使用手牌中的「突擊」代替「固守」進行防禦。" },
    { id: "g06", name: "張遼", type: "將軍", dynasty: "三國(魏)", hp: 4, maxHp: 4, desc: "威震逍遙津，八百破十萬，孫權之夢魘。", skillName: "突陣", skillDesc: "被動技：打出突擊且命中時，可同時從對手手中奪取一張手牌。" },
    { id: "g07", name: "甘寧", type: "將軍", dynasty: "三國(吳)", hp: 4, maxHp: 4, desc: "錦帆賊，百騎劫魏營。", skillName: "劫營", skillDesc: "鎖定技：甘寧在場上時，對手的「後營區」人員血量上限全部減 1。" },
    { id: "g08", name: "尉遲恭", type: "將軍", dynasty: "唐", hp: 4, maxHp: 4, desc: "玄武門之變功臣，後為門神之一。", skillName: "奪槊", skillDesc: "被動技：防禦成功時，反將對手攻擊者的 HP 扣除 1 點。" },
    { id: "g09", name: "秦叔寶", type: "將軍", dynasty: "唐", hp: 4, maxHp: 4, desc: "凌煙閣二十四功臣，後為門神之一。", skillName: "當先", skillDesc: "被動技：上場的第一回合，立刻進行一次免費的突擊。" },
    { id: "g10", name: "狄青", type: "將軍", dynasty: "宋", hp: 4, maxHp: 4, desc: "面刺涅字，常戴銅面具衝鋒的宋朝名將。", skillName: "銅面", skillDesc: "鎖定技：永遠不會成為對手第一選定的攻擊目標。" },
    { id: "g11", name: "戚繼光", type: "將軍", dynasty: "明", hp: 4, maxHp: 4, desc: "抗倭英雄，創立鴛鴦陣。", skillName: "鴛鴦陣", skillDesc: "被動技：場上每存在一名其他中國將軍，防禦力等比上升。" },
    { id: "g12", name: "袁崇煥", type: "將軍", dynasty: "明", hp: 4, maxHp: 4, desc: "寧遠大捷，守衛遼東抗擊後金。", skillName: "堅城", skillDesc: "鎖定技：只要袁崇煥存活，我方主公受到的傷害減半(向上取整)。" },
    { id: "g13", name: "李文忠", type: "將軍", dynasty: "明", hp: 4, maxHp: 4, desc: "明朝開國名將，朱元璋外甥。", skillName: "驍勇", skillDesc: "被動技：若主公受到傷害，李文忠立刻對傷害來源發起一次突擊。" },
    { id: "g14", name: "年羹堯", type: "將軍", dynasty: "清", hp: 4, maxHp: 4, desc: "平定青海叛亂，雍正心腹愛將。", skillName: "平叛", skillDesc: "鎖定技：對抗屬性中有叛變/賊等武將時必定一擊必殺。" },
    { id: "g15", name: "烏蘭泰", type: "將軍", dynasty: "清", hp: 4, maxHp: 4, desc: "清朝中後期將領，曾參與鎮壓太平天國。", skillName: "鎮壓", skillDesc: "被動技：每回合隨機封鎖對手的一張手牌。" },

    // === 軍師/謀士 ===
    { id: "t01", name: "姜子牙", type: "軍師", dynasty: "周", hp: 3, maxHp: 3, img: "assets/tacticians/t01.png", desc: "太公望，齊國始祖，輔佐武王伐紂。", skillName: "太公望", skillDesc: "鎖定技：所有上場的我方武將一進場立刻回復 1 HP。" },
    { id: "t02", name: "范蠡", type: "軍師", dynasty: "越", hp: 3, maxHp: 3, img: "assets/tacticians/t02.png", desc: "商聖，助越王勾踐復國，功成身退。", skillName: "商聖", skillDesc: "被動技：若打出基礎牌(如休整)，有 50% 機率直接翻倍效果。" },
    { id: "t03", name: "張良", type: "軍師", dynasty: "漢", hp: 3, maxHp: 3, symbolItem: "素書", img: "assets/tacticians/t03.png", desc: "運籌帷幄之中，決勝千里之外。", skillName: "運籌", skillDesc: "被動技：每回合可以預先查看並選擇牌庫頂的一張牌執行。" },
    { id: "t04", name: "陳平", type: "軍師", dynasty: "漢", hp: 3, maxHp: 3, img: "assets/tacticians/t04.png", desc: "漢初謀士，六出奇計，解白登之圍。", skillName: "奇計", skillDesc: "鎖定技：允許一回合打出兩張計策卡。" },
    { id: "t05", name: "賈詡", type: "軍師", dynasty: "三國(魏)", hp: 3, maxHp: 3, img: "assets/tacticians/t05.png", desc: "毒士，算無遺策，一言亂天下。", skillName: "毒士", skillDesc: "被動技：被擊殺時，對方隨機兩名將領陷入中毒(回合末扣 1 HP)。" },
    { id: "t06", name: "郭嘉", type: "軍師", dynasty: "三國(魏)", hp: 3, maxHp: 3, img: "assets/tacticians/t06.png", desc: "才策謀略，世之奇士，十勝十敗論。", skillName: "遺計", skillDesc: "被動技：每次受到傷害，立即抽兩張牌；若死亡則再抽兩張。" },
    { id: "t07", name: "荀彧", type: "軍師", dynasty: "三國(魏)", hp: 3, maxHp: 3, img: "assets/tacticians/t07.png", desc: "王佐之才，曹操的首席功臣。", skillName: "驅虎", skillDesc: "被動技：能強制一名敵將攻擊他們自己的主公。" },
    { id: "t08", name: "龐統", type: "軍師", dynasty: "三國(蜀)", hp: 3, maxHp: 3, img: "assets/tacticians/t08.png", desc: "鳳雛，連環計的設計者。", skillName: "連環", skillDesc: "鎖定技：所有對手武將身上預設綁定連環效果(一傷全傷)。" },
    { id: "t09", name: "陸抗", type: "軍師", dynasty: "三國(吳)", hp: 3, maxHp: 3, img: "assets/tacticians/t09.png", desc: "東吳最後的柱石，陸遜之子。", skillName: "柱石", skillDesc: "被動技：只要在場，主公受到傷害不超過 1。" },
    { id: "t10", name: "房玄齡", type: "軍師", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/tacticians/t10.png", desc: "房謀杜斷之「房謀」，大唐賢相。", skillName: "房謀", skillDesc: "被動技：每回合初有 30% 機率直接將一張計策卡加入手牌。" },
    { id: "t11", name: "李泌", type: "軍師", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/tacticians/t11.png", desc: "白衣山人，運籌帷幄平定安史之亂。", skillName: "白衣", skillDesc: "鎖定技：不受任何直接傷害卡的攻擊目標。" },
    { id: "t12", name: "劉伯溫", type: "軍師", dynasty: "明", hp: 3, maxHp: 3, img: "assets/tacticians/t12.png", desc: "三分天下諸葛亮，一統江山劉伯溫。", skillName: "神機", skillDesc: "被動技：可預測對手下一張抽到的牌並決定是否放入墳場。" },
    { id: "t13", name: "姚廣孝", type: "軍師", dynasty: "明", hp: 3, maxHp: 3, img: "assets/tacticians/t13.png", desc: "黑衣宰相，靖難之役的主要策劃者。", skillName: "黑衣", skillDesc: "鎖定技：暗中策劃，回合結束時敵軍無防備武將受到 1 點傷害。" },
    { id: "t14", name: "范文程", type: "軍師", dynasty: "清", hp: 3, maxHp: 3, img: "assets/tacticians/t14.png", desc: "清朝開國文臣之首，輔佐四代帝王。", skillName: "經略", skillDesc: "被動技：我方主公兵力加倍恢復。" },

    // === 後勤/財政 ===
    { id: "s01", name: "蕭何", type: "後勤", dynasty: "漢", hp: 3, maxHp: 3, symbolItem: "漢律", img: "assets/logistics/s01.png", desc: "鎮國家，撫百姓，給餽饟，不絕糧道。", skillName: "糧道", skillDesc: "鎖定技：每回合額外抽取一張「休整」卡進入手牌。" },
    { id: "s02", name: "桑弘羊", type: "後勤", dynasty: "漢", hp: 3, maxHp: 3, img: "assets/logistics/s02.jpg", desc: "推行鹽鐵官營，為漢武帝籌措軍費。", skillName: "鹽鐵", skillDesc: "被動技：我方每打出一張計策卡，即恢復 1 HP。" },
    { id: "s03", name: "諸葛亮", type: "後勤", dynasty: "三國(蜀)", hp: 3, maxHp: 3, img: "assets/logistics/s03.png", desc: "木牛流馬轉運糧草，後勤保障北伐基礎。", skillName: "木牛流馬", skillDesc: "被動技：每回合初恢復 1 HP，同時額外為己方補充 1 張牌。" },
    { id: "s04", name: "魯肅", type: "後勤", dynasty: "三國(吳)", hp: 3, maxHp: 3, img: "assets/logistics/s04.jpg", desc: "榻上策，主導孫劉聯盟的物資協調者。", skillName: "締盟", skillDesc: "被動技：可以強制互換雙方手中任意數量的卡牌。" },
    { id: "s05", name: "杜如晦", type: "後勤", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/logistics/s05.png", desc: "房謀杜斷之「杜斷」，貞觀之治重要推手。", skillName: "杜斷", skillDesc: "被動技：每回合初可強制取消對手上一張計策卡的持續效果。" },
    { id: "s06", name: "劉晏", type: "後勤", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/logistics/s06.png", desc: "理財大師，改革漕運、鹽政，富國不擾民。", skillName: "理財", skillDesc: "被動技：可將墳場的一張資源卡重新洗回牌組。" },
    { id: "s07", name: "王安石", type: "後勤", dynasty: "宋", hp: 3, maxHp: 3, img: "assets/logistics/s07.jpg", desc: "熙寧變法主將，推行青苗法均輸法整頓財政。", skillName: "青苗法", skillDesc: "被動技：每回合初恢復 1 HP，若主公也在場則改為恢復 2 HP。" },
    { id: "s08", name: "張居正", type: "後勤", dynasty: "明", hp: 3, maxHp: 3, img: "assets/logistics/s08.png", desc: "萬曆中興，推行一條鞭法整頓財政稅收。", skillName: "一條鞭", skillDesc: "被動技：將所有的傷害結算延遲至回合末段統一處理。" },
    { id: "s09", name: "李鴻章", type: "後勤", dynasty: "清", hp: 3, maxHp: 3, img: "assets/logistics/s09.jpg", desc: "晚清四大名臣，推動洋務運動，建立新式軍工。", skillName: "洋務", skillDesc: "被動技：犧牲一點血量，可從牌庫強制檢索一張需要的計策卡。" },

    // === 內政/名相 ===
    { id: "n01", name: "管仲", type: "內政", dynasty: "齊", hp: 3, maxHp: 3, img: "assets/internal/n01.png", desc: "春秋第一相，九合諸侯，尊王攘夷。", skillName: "相術", skillDesc: "鎖定技：每回合開始可選擇棄掉一張手牌，換抽兩張牌。" },
    { id: "n02", name: "李斯", type: "內政", dynasty: "秦", hp: 3, maxHp: 3, img: "assets/internal/n02.png", desc: "秦朝丞相，統一文字度量衡，書同文車同軌。", skillName: "書同文", skillDesc: "鎖定技：在場時計策卡費用減少一半。" },
    { id: "n03", name: "魏徵", type: "內政", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/internal/n03.png", desc: "以人為鏡可以明得失，唐太宗首席諍臣名相。", skillName: "明鏡", skillDesc: "被動技：每回合可預先查看並選擇牌庫頂的一張牌執行或棄置。" },
    { id: "n04", name: "姚崇", type: "內政", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/internal/n04.jpg", desc: "唐玄宗開元盛世首相，時稱「救時宰相」。", skillName: "救時", skillDesc: "被動技：每回合初隨機為己方一名武將恢復 1 HP。" },
    { id: "n05", name: "宋璟", type: "內政", dynasty: "唐", hp: 3, maxHp: 3, img: "assets/internal/n05.jpg", desc: "開元名相，廉潔奉公，與姚崇並稱「姚宋」。", skillName: "剛直", skillDesc: "被動技：在場時敵方所有負面效果卡效率降低 30%。" },
    { id: "n06", name: "司馬光", type: "內政", dynasty: "宋", hp: 3, maxHp: 3, img: "assets/internal/n06.jpg", desc: "著《資治通鑑》，以史為鑑，保守派名相。", skillName: "資治", skillDesc: "被動技：每當對手打出計策卡，強制令其效果延遲一回合。" },
    { id: "n07", name: "文天祥", type: "內政", dynasty: "宋", hp: 3, maxHp: 3, desc: "人生自古誰無死，留取丹心照汗青，宋末英烈。", skillName: "丹心", skillDesc: "鎖定技：文天祥陣亡時，己方全體武將本回合獲得「不屈」（免疫傷害）。" },
    { id: "n08", name: "李善長", type: "內政", dynasty: "明", hp: 3, maxHp: 3, desc: "明朝開國第一文臣，輔佐朱元璋建立大明。", skillName: "籌謀", skillDesc: "被動技：每當我方打出突擊命中時，額外抽一張牌。" },
    { id: "n09", name: "于謙", type: "內政", dynasty: "明", hp: 3, maxHp: 3, desc: "北京保衛戰的英雄，粉身碎骨全不怕。", skillName: "保衛", skillDesc: "鎖定技：己方主公受到致命傷害時，于謙可代為承受，全場限一次。" },
    { id: "n10", name: "張廷玉", type: "內政", dynasty: "清", hp: 3, maxHp: 3, desc: "清朝漢臣之冠，配享太廟，歷仕康雍乾三朝。", skillName: "配享", skillDesc: "被動技：持續在場時，每回合己方主公血量上限 +1（最多 +3）。" },
    { id: "n11", name: "曾國藩", type: "內政", dynasty: "清", hp: 3, maxHp: 3, desc: "晚清四大名臣之首，建立湘軍，挽救大清。", skillName: "湘軍", skillDesc: "被動技：每回合可選擇一名己方武將進行強化（攻擊力 +1 至回合末）。" },
    { id: "n12", name: "左宗棠", type: "內政", dynasty: "清", hp: 3, maxHp: 3, desc: "收復新疆，洋務運動重要推手，晚清四大名臣。", skillName: "西征", skillDesc: "被動技：發起突擊時可忽略對手場上一張防禦卡的效果。" },

    // === 監察/諫官 ===
    { id: "j01", name: "包拯", type: "監察", dynasty: "宋", hp: 3, maxHp: 3, img: "assets/supervision/j01.png", desc: "包青天，公正廉明，鐵面無私，日斷陽夜斷陰。", skillName: "鐵面", skillDesc: "鎖定技：清除對手場上任意一名武將身上的所有正面增益狀態。" },
    { id: "j02", name: "海瑞", type: "監察", dynasty: "明", hp: 3, maxHp: 3, img: "assets/supervision/j02.png", desc: "海青天，直言敢諫，剛正不阿，官至應天巡撫。", skillName: "剛正", skillDesc: "鎖定技：反彈一切降攻或減血的負面狀態給施放者。" },
    { id: "j03", name: "左光斗", type: "監察", dynasty: "明", hp: 3, maxHp: 3, img: "assets/supervision/j03.png", desc: "東林黨人，勇彈閹黨，以身殉道。", skillName: "東林", skillDesc: "被動技：每當對手使用陷阱卡，有 50% 機率直接封鎖並廢除該卡。" },
    { id: "j04", name: "楊漣", type: "監察", dynasty: "明", hp: 3, maxHp: 3, img: "assets/supervision/j04.png", desc: "勇彈魏忠賢二十四大罪，被廷杖而不屈。", skillName: "死諫", skillDesc: "被動技：陣亡時，將敵方一名武將強制帶入墳場同歸。" },
    { id: "j05", name: "朱軾", type: "監察", dynasty: "清", hp: 3, maxHp: 3, img: "assets/supervision/j05.png", desc: "清朝清廉大臣，歷仕三朝，學問淵博以直諫聞名。", skillName: "廉直", skillDesc: "被動技：在場時敵方無法通過計策卡直接獲得手牌。" },

    // === 基本卡 ===
    { id: "ba01", name: "突擊 (殺)", type: "計策", dynasty: "通用", isBasic: true, hp: "-", maxHp: "-", desc: "【基本卡】對目標造成 1 點傷害。目標可打出「固守」閃避。" },
    { id: "ba02", name: "固守 (閃)", type: "計策", dynasty: "通用", isBasic: true, hp: "-", maxHp: "-", desc: "【基本卡】防禦卡。當敵方對你發動「突擊」時可從手牌打出，抵消該次傷害。" },
    { id: "ba03", name: "休整 (桃)", type: "計策", dynasty: "通用", isBasic: true, hp: "-", maxHp: "-", desc: "【基本卡】在自己的回合，為場上一名己方武將恢復 1 點血量。" },

    // === 計策卡 (Spells) ===
    { id: "sp01", name: "草船借箭", type: "計策", dynasty: "通用", hp: "-", maxHp: "-", desc: "【計策卡】一回合內，不會受到對手遠程兵種的攻擊，並抽一張牌。" },
    { id: "sp02", name: "釜底抽薪", type: "計策", dynasty: "通用", hp: "-", maxHp: "-", desc: "【計策卡】直接破壞對手場上一張後營區的角色。" },
    { id: "sp03", name: "連環計", type: "計策", dynasty: "通用", hp: "-", maxHp: "-", desc: "【計策卡】選擇對手兩張武將卡，當其中一張受到傷害時，另一張也必須承受相同傷害。" },

    // === 突發事件卡 (Traps) ===
    { id: "tr01", name: "空城計", type: "突發事件", dynasty: "通用", hp: "-", maxHp: "-", desc: "【事件卡】當對手發動突擊時可用。強制將該突擊作廢，並結束對手的戰鬥回合。" },
    { id: "tr02", name: "杯酒釋兵權", type: "突發事件", dynasty: "通用", hp: "-", maxHp: "-", desc: "【事件卡】對手召喚「將軍」或「大將軍」時觸發。強制將其送回手牌。" },
    { id: "tr03", name: "十面埋伏", type: "突發事件", dynasty: "通用", hp: "-", maxHp: "-", desc: "【事件卡】當對手發動攻擊時觸發。對手發起攻擊的武將直接受到 1 點傷害。" }
];

// 初始化牌組 (39張，抽出君主後不再包含其他君主)
function generateDeck(excludeMonarchs = false) {
    let deck = [];
    let characters = cardDatabase.filter(c => c.type !== "計策" && c.type !== "突發事件");
    if (excludeMonarchs) {
        characters = characters.filter(c => c.type !== "君王");
    }
    const actions = cardDatabase.filter(c => c.type === "計策" || c.type === "突發事件" || c.isBasic);

    // 放入人物
    for (let i = 0; i < 24; i++) {
        deck.push({ ...characters[Math.floor(Math.random() * characters.length)], uid: Math.random().toString(36).substr(2, 9) });
    }
    // 放入計策與基本卡
    for (let i = 0; i < 15; i++) {
        deck.push({ ...actions[Math.floor(Math.random() * actions.length)], uid: Math.random().toString(36).substr(2, 9) });
    }

    // Fisher-Yates 洗牌（無偏）
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

window.cardDatabase = cardDatabase;
