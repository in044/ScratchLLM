/* eslint-disable max-len, func-style, require-jsdoc */
import analyzeScratchBlocks from './scratchblocks-ast';

const primitiveNumber = value => [1, [4, String(value)]];
const primitiveString = value => [1, [10, String(value)]];
const normalize = text => String(text || '')
    .replace(/[⚑🚩]/gu, '旗')
    .replace(/[（]/gu, '(')
    .replace(/[）]/gu, ')')
    .replace(/[［]/gu, '[')
    .replace(/[］]/gu, ']')
    .replace(/[＜]/gu, '<')
    .replace(/[＞]/gu, '>')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeLine = line => normalize(String(line || '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/u, '')
    .replace(/^\s*`|`\s*$/gu, '')
    .replace(/[;；]\s*$/u, ''))
    .replace(/^(?:終了|おわり|終わり)$/u, 'end')
    .replace(/^(?:else|それ以外|そうでなければ)$/iu, 'でなければ');

const targetHeader = line => String(line || '').trim()
    .match(/^#{1,6}\s*(.+?)(?:\s*[:：])?$/u);

const unwrap = value => String(value || '')
    .trim()
    .replace(/^\((.*)\)$/u, '$1')
    .replace(/^\[(.*)\]$/u, '$1')
    .replace(/^<(.*)>$/u, '$1')
    .replace(/\s+v$/u, '')
    .trim();

const stringInput = value => primitiveString(unwrap(value));

const roundInput = value => {
    const text = String(value);
    return text.startsWith('(') && text.endsWith(')') ? text : `(${text})`;
};
const booleanText = value => {
    const text = String(value);
    return text.startsWith('<') && text.endsWith('>') ? text : `<${text}>`;
};

const menuValueMap = {
    どこかの場所: '_random_',
    マウスのポインター: '_mouse_',
    自分自身: '_myself_',
    すべてを止める: 'all',
    このスクリプト: 'this script',
    スプライトの他のスクリプト: 'other scripts in sprite',
    左右のみ: 'left-right',
    回転しない: "don't rotate",
    自由に回転: 'all around',
    最前面: 'front',
    最背面: 'back',
    手前に出す: 'forward',
    奥に下げる: 'backward',
    スペース: 'space',
    上向き矢印: 'up arrow',
    下向き矢印: 'down arrow',
    右向き矢印: 'right arrow',
    左向き矢印: 'left arrow',
    音量: 'LOUDNESS',
    タイマー: 'TIMER'
};

const menuValue = value => {
    const unwrapped = unwrap(value);
    return menuValueMap[unwrapped] || unwrapped;
};

const blockSpecs = [
    {
        opcode: 'event_whenflagclicked',
        patterns: [/^(?:旗|green flag) が(?:押された|クリックされた)とき$/u],
        hat: true,
        toText: () => '⚑ が押されたとき'
    },
    {
        opcode: 'event_whenkeypressed',
        patterns: [/^\[(.+?)\] キーが押されたとき$/u],
        hat: true,
        build: m => ({fields: {KEY_OPTION: [menuValue(m[1]), null]}}),
        toText: block => `[${reverseMenu(fieldValue(block, 'KEY_OPTION'))} v] キーが押されたとき`
    },
    {
        opcode: 'event_whenthisspriteclicked',
        patterns: [/^このスプライトが押されたとき$/u],
        hat: true,
        toText: () => 'このスプライトが押されたとき'
    },
    {
        opcode: 'event_whenbroadcastreceived',
        patterns: [/^\[(.+?)\] を受け取ったとき$/u],
        hat: true,
        build: m => {
            const name = unwrap(m[1]);
            return {fields: {BROADCAST_OPTION: [name, `broadcast_${name}`]}};
        },
        toText: block => `[${fieldValue(block, 'BROADCAST_OPTION')} v] を受け取ったとき`
    },
    {
        opcode: 'event_whenbackdropswitchesto',
        patterns: [/^背景が \[(.+?)\] になったとき$/u],
        hat: true,
        build: m => ({fields: {BACKDROP: [unwrap(m[1]), null]}}),
        toText: block => `背景が [${fieldValue(block, 'BACKDROP')} v] になったとき`
    },
    {opcode: 'event_whenstageclicked', patterns: [/^ステージが押されたとき$/u], hat: true, toText: () => 'ステージが押されたとき'},
    {
        opcode: 'event_whengreaterthan',
        patterns: [/^\[(.+?)\] > (.+?) のとき$/u],
        hat: true,
        build: (m, ctx) => ({
            fields: {WHENGREATERTHANMENU: [menuValue(m[1]), null]},
            inputs: {VALUE: valueBlockInput(m[2], ctx, true)}
        }),
        toText: (block, readInput) => `[${reverseMenu(fieldValue(block, 'WHENGREATERTHANMENU'))} v] > ${readInput(block, 'VALUE', '10')} のとき`
    },
    {
        opcode: 'motion_movesteps',
        patterns: [/^(.+?) 歩動かす$/u],
        build: (m, ctx) => ({inputs: {STEPS: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `${roundInput(readInput(block, 'STEPS', '10'))} 歩動かす`
    },
    {
        opcode: 'motion_turnright',
        patterns: [/^(?:右に|↻) (.+?) 度回す$/u],
        build: (m, ctx) => ({inputs: {DEGREES: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `右に ${roundInput(readInput(block, 'DEGREES', '15'))} 度回す`
    },
    {
        opcode: 'motion_turnleft',
        patterns: [/^(?:左に|↺) (.+?) 度回す$/u],
        build: (m, ctx) => ({inputs: {DEGREES: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `左に ${roundInput(readInput(block, 'DEGREES', '15'))} 度回す`
    },
    {
        opcode: 'motion_gotoxy',
        patterns: [/^x座標を (.+?)、?y座標を (.+?) にする$/u],
        build: (m, ctx) => ({inputs: {X: valueBlockInput(m[1], ctx, true), Y: valueBlockInput(m[2], ctx, true)}}),
        toText: (block, readInput) => `x座標を ${roundInput(readInput(block, 'X', '0'))}、y座標を ${roundInput(readInput(block, 'Y', '0'))} にする`
    },
    {
        opcode: 'motion_goto',
        patterns: [/^(?!.*秒で)(.+?) へ行く$/u],
        build: (m, ctx) => ({inputs: {TO: ctx.addShadow('motion_goto_menu', 'TO', menuValue(m[1]))}}),
        toText: (block, readInput) => `(${reverseMenu(readInput(block, 'TO', 'どこかの場所'))} v) へ行く`
    },
    {
        opcode: 'motion_glideto',
        patterns: [/^(.+?) 秒で (.+?) へ行く$/u],
        build: (m, ctx) => ({inputs: {
            SECS: valueBlockInput(m[1], ctx, true),
            TO: ctx.addShadow('motion_glideto_menu', 'TO', menuValue(m[2]))
        }}),
        toText: (block, readInput) => `${roundInput(readInput(block, 'SECS', '1'))} 秒で (${reverseMenu(readInput(block, 'TO', 'どこかの場所'))} v) へ行く`
    },
    {
        opcode: 'motion_glidesecstoxy',
        patterns: [/^(.+?) 秒でx座標を (.+?) に、?y座標を (.+?) に変える$/u],
        build: (m, ctx) => ({inputs: {
            SECS: valueBlockInput(m[1], ctx, true),
            X: valueBlockInput(m[2], ctx, true),
            Y: valueBlockInput(m[3], ctx, true)
        }}),
        toText: (block, readInput) => `${roundInput(readInput(block, 'SECS', '1'))} 秒でx座標を ${roundInput(readInput(block, 'X', '0'))} に、y座標を ${roundInput(readInput(block, 'Y', '0'))} に変える`
    },
    {
        opcode: 'motion_pointindirection',
        patterns: [/^(.+?) 度に向ける$/u],
        build: (m, ctx) => ({inputs: {DIRECTION: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `${roundInput(readInput(block, 'DIRECTION', '90'))} 度に向ける`
    },
    {
        opcode: 'motion_pointtowards',
        patterns: [/^(.+?) へ向ける$/u],
        build: (m, ctx) => ({inputs: {TOWARDS: ctx.addShadow('motion_pointtowards_menu', 'TOWARDS', menuValue(m[1]))}}),
        toText: (block, readInput) => `(${readInput(block, 'TOWARDS', 'マウスのポインター')} v) へ向ける`
    },
    {
        opcode: 'motion_changexby',
        patterns: [/^x座標を (.+?) ずつ変える$/u],
        build: (m, ctx) => ({inputs: {DX: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `x座標を ${roundInput(readInput(block, 'DX', '10'))} ずつ変える`
    },
    {
        opcode: 'motion_setx',
        patterns: [/^x座標を (.+?) にする$/u],
        build: (m, ctx) => {
            const incrementInput = selfUpdateValueInput('x座標', m[1], ctx);
            return incrementInput ? {
                opcode: 'motion_changexby',
                inputs: {DX: incrementInput}
            } : {inputs: {X: valueBlockInput(m[1], ctx, true)}};
        },
        toText: (block, readInput) => `x座標を ${roundInput(readInput(block, 'X', '0'))} にする`
    },
    {
        opcode: 'motion_changeyby',
        patterns: [/^y座標を (.+?) ずつ変える$/u],
        build: (m, ctx) => ({inputs: {DY: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `y座標を ${roundInput(readInput(block, 'DY', '10'))} ずつ変える`
    },
    {
        opcode: 'motion_sety',
        patterns: [/^y座標を (.+?) にする$/u],
        build: (m, ctx) => {
            const incrementInput = selfUpdateValueInput('y座標', m[1], ctx);
            return incrementInput ? {
                opcode: 'motion_changeyby',
                inputs: {DY: incrementInput}
            } : {inputs: {Y: valueBlockInput(m[1], ctx, true)}};
        },
        toText: (block, readInput) => `y座標を ${roundInput(readInput(block, 'Y', '0'))} にする`
    },
    {
        opcode: 'motion_ifonedgebounce',
        patterns: [/^もし端に着いたら、?跳ね返る$/u],
        toText: () => 'もし端に着いたら、跳ね返る'
    },
    {
        opcode: 'motion_setrotationstyle',
        patterns: [/^回転方法を \[(.+?)\] にする$/u],
        build: m => ({fields: {STYLE: [menuValue(m[1]), null]}}),
        toText: block => `回転方法を [${reverseMenu(fieldValue(block, 'STYLE'))} v] にする`
    },
    {
        opcode: 'looks_sayforsecs',
        patterns: [/^\[(.*?)\] と (.+?) 秒言う$/u],
        build: (m, ctx) => ({inputs: {MESSAGE: stringInput(m[1]), SECS: valueBlockInput(m[2], ctx, true)}}),
        toText: (block, readInput) => `[${readInput(block, 'MESSAGE', 'こんにちは!')}] と ${roundInput(readInput(block, 'SECS', '2'))} 秒言う`
    },
    {
        opcode: 'looks_say',
        patterns: [/^\[(.*?)\] と言う$/u],
        build: m => ({inputs: {MESSAGE: stringInput(m[1])}}),
        toText: (block, readInput) => `[${readInput(block, 'MESSAGE', 'こんにちは!')}] と言う`
    },
    {
        opcode: 'looks_thinkforsecs',
        patterns: [/^\[(.*?)\] と (.+?) 秒考える$/u],
        build: (m, ctx) => ({inputs: {MESSAGE: stringInput(m[1]), SECS: valueBlockInput(m[2], ctx, true)}}),
        toText: (block, readInput) => `[${readInput(block, 'MESSAGE', 'うーん...')}] と ${roundInput(readInput(block, 'SECS', '2'))} 秒考える`
    },
    {
        opcode: 'looks_think',
        patterns: [/^\[(.*?)\] と考える$/u],
        build: m => ({inputs: {MESSAGE: stringInput(m[1])}}),
        toText: (block, readInput) => `[${readInput(block, 'MESSAGE', 'うーん')}] と考える`
    },
    {opcode: 'looks_nextcostume', patterns: [/^次のコスチュームにする$/u], toText: () => '次のコスチュームにする'},
    {opcode: 'looks_nextbackdrop', patterns: [/^次の背景にする$/u], toText: () => '次の背景にする'},
    {
        opcode: 'looks_switchcostumeto',
        patterns: [/^コスチュームを (.+?) にする$/u],
        build: (m, ctx) => ({inputs: {COSTUME: ctx.addShadow('looks_costume', 'COSTUME', unwrap(m[1]))}}),
        toText: (block, readInput) => `コスチュームを (${readInput(block, 'COSTUME', 'costume1')} v) にする`
    },
    {
        opcode: 'looks_switchbackdropto',
        patterns: [/^背景を (.+?) にする$/u],
        build: (m, ctx) => ({inputs: {BACKDROP: ctx.addShadow('looks_backdrops', 'BACKDROP', unwrap(m[1]))}}),
        toText: (block, readInput) => `背景を (${readInput(block, 'BACKDROP', '背景1')} v) にする`
    },
    {
        opcode: 'looks_switchbackdroptoandwait',
        patterns: [/^背景を (.+?) にして待つ$/u],
        build: (m, ctx) => ({inputs: {BACKDROP: ctx.addShadow('looks_backdrops', 'BACKDROP', unwrap(m[1]))}}),
        toText: (block, readInput) => `背景を (${readInput(block, 'BACKDROP', '背景1')} v) にして待つ`
    },
    {
        opcode: 'looks_changeeffectby',
        patterns: [/^\[(色|魚眼|渦巻き|ピクセル化|モザイク|明るさ|幽霊)(?: v)?\] の効果を (.+?) ずつ変える$/u],
        build: (m, ctx) => ({
            fields: {EFFECT: [menuValue(m[1]), null]},
            inputs: {CHANGE: valueBlockInput(m[2], ctx, true)}
        }),
        toText: (block, readInput) => `[${reverseMenu(fieldValue(block, 'EFFECT'))} v] の効果を ${roundInput(readInput(block, 'CHANGE', '25'))} ずつ変える`
    },
    {
        opcode: 'looks_seteffectto',
        patterns: [/^\[(色|魚眼|渦巻き|ピクセル化|モザイク|明るさ|幽霊)(?: v)?\] の効果を (.+?) にする$/u],
        build: (m, ctx) => ({
            fields: {EFFECT: [menuValue(m[1]), null]},
            inputs: {VALUE: valueBlockInput(m[2], ctx, true)}
        }),
        toText: (block, readInput) => `[${reverseMenu(fieldValue(block, 'EFFECT'))} v] の効果を ${roundInput(readInput(block, 'VALUE', '0'))} にする`
    },
    {opcode: 'looks_cleargraphiceffects', patterns: [/^画像効果をなくす$/u], toText: () => '画像効果をなくす'},
    {
        opcode: 'looks_changesizeby',
        patterns: [/^大きさを (.+?) ずつ変える$/u],
        build: (m, ctx) => ({inputs: {CHANGE: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `大きさを ${roundInput(readInput(block, 'CHANGE', '10'))} ずつ変える`
    },
    {
        opcode: 'looks_setsizeto',
        patterns: [/^大きさを (.+?) ?%にする$/u],
        build: (m, ctx) => ({inputs: {SIZE: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `大きさを ${roundInput(readInput(block, 'SIZE', '100'))} %にする`
    },
    {opcode: 'looks_show', patterns: [/^表示する$/u], toText: () => '表示する'},
    {opcode: 'looks_hide', patterns: [/^隠す$/u], toText: () => '隠す'},
    {
        opcode: 'looks_gotofrontback',
        patterns: [/^\[(.+?)\] へ移動する$/u],
        build: m => ({fields: {FRONT_BACK: [menuValue(m[1]), null]}}),
        toText: block => `[${reverseMenu(fieldValue(block, 'FRONT_BACK'))} v] へ移動する`
    },
    {
        opcode: 'looks_goforwardbackwardlayers',
        patterns: [/^(.+?) 層 \[(.+?)\]$/u],
        build: (m, ctx) => ({
            fields: {FORWARD_BACKWARD: [menuValue(m[2]), null]},
            inputs: {NUM: valueBlockInput(m[1], ctx, true)}
        }),
        toText: (block, readInput) => `${roundInput(readInput(block, 'NUM', '1'))} 層 [${reverseMenu(fieldValue(block, 'FORWARD_BACKWARD'))} v]`
    },
    {
        opcode: 'sound_playuntildone',
        patterns: [/^終わるまで (.+?) の音を鳴らす$/u],
        build: (m, ctx) => ({inputs: {SOUND_MENU: ctx.addShadow('sound_sounds_menu', 'SOUND_MENU', unwrap(m[1]))}}),
        toText: (block, readInput) => `終わるまで (${readInput(block, 'SOUND_MENU', 'Meow')} v) の音を鳴らす`
    },
    {
        opcode: 'sound_play',
        patterns: [/^(.+?) の音を鳴らす$/u],
        build: (m, ctx) => ({inputs: {SOUND_MENU: ctx.addShadow('sound_sounds_menu', 'SOUND_MENU', unwrap(m[1]))}}),
        toText: (block, readInput) => `(${readInput(block, 'SOUND_MENU', 'Meow')} v) の音を鳴らす`
    },
    {opcode: 'sound_stopallsounds', patterns: [/^すべての音を止める$/u], toText: () => 'すべての音を止める'},
    {
        opcode: 'sound_changeeffectby',
        patterns: [/^\[(ピッチ|左右にパン)(?: v)?\] の効果を (.+?) ずつ変える$/u],
        build: (m, ctx) => ({
            fields: {EFFECT: [m[1] === 'ピッチ' ? 'PITCH' : 'PAN', null]},
            inputs: {VALUE: valueBlockInput(m[2], ctx, true)}
        }),
        toText: (block, readInput) => `[${fieldValue(block, 'EFFECT') === 'PITCH' ? 'ピッチ' : '左右にパン'} v] の効果を ${roundInput(readInput(block, 'VALUE', '10'))} ずつ変える`
    },
    {
        opcode: 'sound_seteffectto',
        patterns: [/^\[(ピッチ|左右にパン)(?: v)?\] の効果を (.+?) にする$/u],
        build: (m, ctx) => ({
            fields: {EFFECT: [m[1] === 'ピッチ' ? 'PITCH' : 'PAN', null]},
            inputs: {VALUE: valueBlockInput(m[2], ctx, true)}
        }),
        toText: (block, readInput) => `[${fieldValue(block, 'EFFECT') === 'PITCH' ? 'ピッチ' : '左右にパン'} v] の効果を ${roundInput(readInput(block, 'VALUE', '100'))} にする`
    },
    {opcode: 'sound_cleareffects', patterns: [/^音の効果をなくす$/u], toText: () => '音の効果をなくす'},
    {
        opcode: 'sound_changevolumeby',
        patterns: [/^音量を (.+?) ずつ変える$/u],
        build: (m, ctx) => ({inputs: {VOLUME: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `音量を ${roundInput(readInput(block, 'VOLUME', '-10'))} ずつ変える`
    },
    {
        opcode: 'sound_setvolumeto',
        patterns: [/^音量を (.+?) ?%にする$/u],
        build: (m, ctx) => ({inputs: {VOLUME: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `音量を ${roundInput(readInput(block, 'VOLUME', '100'))} %にする`
    },
    {
        opcode: 'operator_add',
        patterns: [],
        reporter: true,
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM1', '0'))} + ${roundInput(readInput(block, 'NUM2', '0'))})`
    },
    {
        opcode: 'operator_subtract',
        patterns: [],
        reporter: true,
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM1', '0'))} - ${roundInput(readInput(block, 'NUM2', '0'))})`
    },
    {
        opcode: 'operator_multiply',
        patterns: [],
        reporter: true,
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM1', '0'))} * ${roundInput(readInput(block, 'NUM2', '0'))})`
    },
    {
        opcode: 'operator_divide',
        patterns: [],
        reporter: true,
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM1', '0'))} / ${roundInput(readInput(block, 'NUM2', '0'))})`
    },
    {opcode: 'motion_xposition', patterns: [/^\(x座標\)$/u], reporter: true, toText: () => '(x座標)'},
    {opcode: 'motion_yposition', patterns: [/^\(y座標\)$/u], reporter: true, toText: () => '(y座標)'},
    {opcode: 'motion_direction', patterns: [/^\(向き\)$/u], reporter: true, toText: () => '(向き)'},
    {opcode: 'looks_size', patterns: [/^\(大きさ\)$/u], reporter: true, toText: () => '(大きさ)'},
    {
        opcode: 'looks_costumenumbername',
        patterns: [/^\(コスチュームの \[(.+?)\]\)$/u],
        reporter: true,
        build: m => ({fields: {NUMBER_NAME: [menuValue(m[1]), null]}}),
        toText: block => `(コスチュームの [${reverseMenu(fieldValue(block, 'NUMBER_NAME'))} v])`
    },
    {
        opcode: 'looks_backdropnumbername',
        patterns: [/^\(背景の \[(.+?)\]\)$/u],
        reporter: true,
        build: m => ({fields: {NUMBER_NAME: [menuValue(m[1]), null]}}),
        toText: block => `(背景の [${reverseMenu(fieldValue(block, 'NUMBER_NAME'))} v])`
    },
    {opcode: 'sound_volume', patterns: [/^\(音量\)$/u], reporter: true, toText: () => '(音量)'},
    {opcode: 'sensing_answer', patterns: [/^\(答え\)$/u], reporter: true, toText: () => '(答え)'},
    {opcode: 'sensing_mousex', patterns: [/^\(マウスのx座標\)$/u], reporter: true, toText: () => '(マウスのx座標)'},
    {opcode: 'sensing_mousey', patterns: [/^\(マウスのy座標\)$/u], reporter: true, toText: () => '(マウスのy座標)'},
    {opcode: 'sensing_loudness', patterns: [/^\(音量\)$/u], reporter: true, toText: () => '(音量)'},
    {opcode: 'sensing_timer', patterns: [/^\(タイマー\)$/u], reporter: true, toText: () => '(タイマー)'},
    {opcode: 'sensing_dayssince2000', patterns: [/^\(2000年からの日数\)$/u], reporter: true, toText: () => '(2000年からの日数)'},
    {opcode: 'sensing_username', patterns: [/^\(ユーザー名\)$/u], reporter: true, toText: () => '(ユーザー名)'},
    {
        opcode: 'sensing_current',
        patterns: [/^\(現在の \[(.+?)\]\)$/u],
        reporter: true,
        build: m => ({fields: {CURRENTMENU: [menuValue(m[1]), null]}}),
        toText: block => `(現在の [${reverseMenu(fieldValue(block, 'CURRENTMENU'))} v])`
    },
    {
        opcode: 'sensing_distanceto',
        patterns: [/^\((.+?) までの距離\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {DISTANCETOMENU: ctx.addShadow('sensing_distancetomenu', 'DISTANCETOMENU', menuValue(m[1]))}}),
        toText: (block, readInput) => `((${reverseMenu(readInput(block, 'DISTANCETOMENU', 'マウスのポインター'))} v) までの距離)`
    },
    {
        opcode: 'sensing_of',
        patterns: [/^\((.+?) の \[(.+?)\]\)$/u],
        reporter: true,
        build: (m, ctx) => ({
            fields: {PROPERTY: [menuValue(m[2]), null]},
            inputs: {OBJECT: ctx.addShadow('sensing_of_object_menu', 'OBJECT', menuValue(m[1]))}
        }),
        toText: (block, readInput) => `((${reverseMenu(readInput(block, 'OBJECT', 'ステージ'))} v) の [${reverseMenu(fieldValue(block, 'PROPERTY'))} v])`
    },
    {
        opcode: 'operator_random',
        patterns: [/^\((.+?) から (.+?) までの乱数\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {
            FROM: valueBlockInput(m[1], ctx, true),
            TO: valueBlockInput(m[2], ctx, true)
        }}),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'FROM', '1'))} から ${roundInput(readInput(block, 'TO', '10'))} までの乱数)`
    },
    {
        opcode: 'operator_join',
        patterns: [/^\((.+?) と (.+?)\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {STRING1: valueBlockInput(m[1], ctx), STRING2: valueBlockInput(m[2], ctx)}}),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'STRING1', 'りんご'))} と ${roundInput(readInput(block, 'STRING2', 'バナナ'))})`
    },
    {
        opcode: 'operator_letter_of',
        patterns: [/^\((.+?) の (.+?) 番目の文字\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {STRING: valueBlockInput(m[1], ctx), LETTER: valueBlockInput(m[2], ctx, true)}}),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'STRING', 'りんご'))} の ${roundInput(readInput(block, 'LETTER', '1'))} 番目の文字)`
    },
    {
        opcode: 'operator_length',
        patterns: [/^\((.+?) の長さ\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {STRING: valueBlockInput(m[1], ctx)}}),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'STRING', 'りんご'))} の長さ)`
    },
    {
        opcode: 'operator_mod',
        patterns: [/^\((.+?) を (.+?) で割った余り\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {NUM1: valueBlockInput(m[1], ctx, true), NUM2: valueBlockInput(m[2], ctx, true)}}),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM1', '10'))} を ${roundInput(readInput(block, 'NUM2', '3'))} で割った余り)`
    },
    {
        opcode: 'operator_round',
        patterns: [/^\((.+?) を四捨五入\)$/u],
        reporter: true,
        build: (m, ctx) => ({inputs: {NUM: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM', '3.14'))} を四捨五入)`
    },
    {
        opcode: 'operator_mathop',
        patterns: [/^\((.+?) の \[(.+?)\]\)$/u],
        reporter: true,
        build: (m, ctx) => ({
            fields: {OPERATOR: [menuValue(m[2]), null]},
            inputs: {NUM: valueBlockInput(m[1], ctx, true)}
        }),
        toText: (block, readInput) => `(${roundInput(readInput(block, 'NUM', '9'))} の [${reverseMenu(fieldValue(block, 'OPERATOR'))} v])`
    },
    {
        opcode: 'data_itemoflist',
        patterns: [/^\(\[(.+?)\] の (.+?) 番目\)$/u],
        reporter: true,
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}, inputs: {INDEX: valueBlockInput(m[2], ctx)}};
        },
        toText: (block, readInput) => `([${fieldValue(block, 'LIST')} v] の ${roundInput(readInput(block, 'INDEX', '1'))} 番目)`
    },
    {
        opcode: 'data_itemnumoflist',
        patterns: [/^\(\[(.+?)\] 中の (.+?) の場所\)$/u],
        reporter: true,
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}, inputs: {ITEM: valueBlockInput(m[2], ctx)}};
        },
        toText: (block, readInput) => `([${fieldValue(block, 'LIST')} v] 中の ${roundInput(readInput(block, 'ITEM', 'thing'))} の場所)`
    },
    {
        opcode: 'data_lengthoflist',
        patterns: [/^\(\[(.+?)\] の長さ\)$/u],
        reporter: true,
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}};
        },
        toText: block => `([${fieldValue(block, 'LIST')} v] の長さ)`
    },
    {
        opcode: 'data_listcontents',
        patterns: [/^\(\[(.+?)\]\)$/u],
        reporter: true,
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}};
        },
        toText: block => `([${fieldValue(block, 'LIST')} v])`
    },
    {
        opcode: 'data_variable',
        patterns: [/^\((.+?)\)$/u],
        reporter: true,
        build: (m, ctx) => {
            const variable = ctx.variable(unwrap(m[1]));
            return {fields: {VARIABLE: [variable.name, variable.id]}};
        },
        toText: block => `(${fieldValue(block, 'VARIABLE')})`
    },
    {
        opcode: 'operator_and',
        patterns: [/^<\s*(<.+>)\s+かつ\s+(<.+>)\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {
            OPERAND1: booleanBlockInput(m[1], ctx),
            OPERAND2: booleanBlockInput(m[2], ctx)
        }}),
        toText: (block, readInput) => `<${booleanText(readInput(block, 'OPERAND1', ''))} かつ ${booleanText(readInput(block, 'OPERAND2', ''))}>`
    },
    {
        opcode: 'operator_or',
        patterns: [/^<\s*(<.+>)\s+または\s+(<.+>)\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {
            OPERAND1: booleanBlockInput(m[1], ctx),
            OPERAND2: booleanBlockInput(m[2], ctx)
        }}),
        toText: (block, readInput) => `<${booleanText(readInput(block, 'OPERAND1', ''))} または ${booleanText(readInput(block, 'OPERAND2', ''))}>`
    },
    {
        opcode: 'operator_not',
        patterns: [/^<\s*(<.+>)\s+ではない\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {OPERAND: booleanBlockInput(m[1], ctx)}}),
        toText: (block, readInput) => `<${booleanText(readInput(block, 'OPERAND', ''))} ではない>`
    },
    {
        opcode: 'operator_contains',
        patterns: [/^<\s*((?!\[).+?)\s+に\s+(.+?)\s+が含まれる\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {
            STRING1: valueBlockInput(m[1], ctx),
            STRING2: valueBlockInput(m[2], ctx)
        }}),
        toText: (block, readInput) => `<${roundInput(readInput(block, 'STRING1', ''))} に ${roundInput(readInput(block, 'STRING2', ''))} が含まれる>`
    },
    {
        opcode: 'data_listcontainsitem',
        patterns: [/^<\s*\[(.+?)(?: v)?\]\s+に\s+(.+?)\s+が含まれる\s*>$/u],
        boolean: true,
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {
                fields: {LIST: [list.name, list.id]},
                inputs: {ITEM: valueBlockInput(m[2], ctx)}
            };
        },
        toText: (block, readInput) => `<[${fieldValue(block, 'LIST')} v] に ${roundInput(readInput(block, 'ITEM', 'thing'))} が含まれる>`
    },
    {
        opcode: 'operator_gt',
        patterns: [/^<\s*(.+?)\s+>\s+(.+?)\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {
            OPERAND1: valueBlockInput(m[1], ctx),
            OPERAND2: valueBlockInput(m[2], ctx)
        }}),
        toText: (block, readInput) => `<${roundInput(readInput(block, 'OPERAND1', ''))} > ${roundInput(readInput(block, 'OPERAND2', ''))}>`
    },
    {
        opcode: 'operator_lt',
        patterns: [/^<\s*(.+?)\s+<\s+(.+?)\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {
            OPERAND1: valueBlockInput(m[1], ctx),
            OPERAND2: valueBlockInput(m[2], ctx)
        }}),
        toText: (block, readInput) => `<${roundInput(readInput(block, 'OPERAND1', ''))} < ${roundInput(readInput(block, 'OPERAND2', ''))}>`
    },
    {
        opcode: 'operator_equals',
        patterns: [/^<\s*(.+?)\s+=\s+(.+?)\s*>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {
            OPERAND1: valueBlockInput(m[1], ctx),
            OPERAND2: valueBlockInput(m[2], ctx)
        }}),
        toText: (block, readInput) => `<${roundInput(readInput(block, 'OPERAND1', ''))} = ${roundInput(readInput(block, 'OPERAND2', ''))}>`
    },
    {
        opcode: 'control_wait',
        patterns: [/^(.+?) 秒待つ$/u],
        build: (m, ctx) => ({inputs: {DURATION: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `${roundInput(readInput(block, 'DURATION', '1'))} 秒待つ`
    },
    {
        opcode: 'control_repeat',
        patterns: [/^(.+?) 回繰り返す$/u],
        cBlock: true,
        build: (m, ctx) => ({inputs: {TIMES: valueBlockInput(m[1], ctx, true)}}),
        toText: (block, readInput) => `${roundInput(readInput(block, 'TIMES', '10'))} 回繰り返す`
    },
    {opcode: 'control_forever', patterns: [/^ずっと$/u], cBlock: true, toText: () => 'ずっと'},
    {
        opcode: 'control_if',
        patterns: [/^もし (.+?) なら$/u],
        cBlock: true,
        build: (m, ctx) => ({inputs: {CONDITION: booleanBlockInput(m[1], ctx)}}),
        toText: (block, readInput) => `もし ${booleanText(readInput(block, 'CONDITION', ''))} なら`
    },
    {
        opcode: 'control_if_else',
        patterns: [/^もし (.+?) なら$/u],
        cBlock: true,
        hasElse: true,
        build: (m, ctx) => ({inputs: {CONDITION: booleanBlockInput(m[1], ctx)}}),
        toText: (block, readInput) => `もし ${booleanText(readInput(block, 'CONDITION', ''))} なら`
    },
    {
        opcode: 'control_wait_until',
        patterns: [/^(.+?) まで待つ$/u],
        build: (m, ctx) => ({inputs: {CONDITION: booleanBlockInput(m[1], ctx)}}),
        toText: (block, readInput) => `${booleanText(readInput(block, 'CONDITION', ''))} まで待つ`
    },
    {
        opcode: 'control_repeat_until',
        patterns: [/^(.+?) まで繰り返す$/u],
        cBlock: true,
        build: (m, ctx) => ({inputs: {CONDITION: booleanBlockInput(m[1], ctx)}}),
        toText: (block, readInput) => `${booleanText(readInput(block, 'CONDITION', ''))} まで繰り返す`
    },
    {
        opcode: 'control_stop',
        patterns: [/^\[(.+?)\]$/u],
        build: m => ({fields: {STOP_OPTION: [menuValue(m[1]), null]}}),
        toText: block => `[${reverseMenu(fieldValue(block, 'STOP_OPTION'))} v]`
    },
    {opcode: 'control_start_as_clone', patterns: [/^クローンされたとき$/u], hat: true, toText: () => 'クローンされたとき'},
    {
        opcode: 'control_create_clone_of',
        patterns: [/^\[(.+?)\] のクローンを作る$/u],
        build: (m, ctx) => ({inputs: {CLONE_OPTION: ctx.addShadow('control_create_clone_of_menu', 'CLONE_OPTION', menuValue(m[1]))}}),
        toText: (block, readInput) => `[${reverseMenu(readInput(block, 'CLONE_OPTION', '自分自身'))} v] のクローンを作る`
    },
    {opcode: 'control_delete_this_clone', patterns: [/^このクローンを削除する$/u], toText: () => 'このクローンを削除する'},
    {
        opcode: 'sensing_keypressed',
        patterns: [/^< ?(.+?) キーが押された ?>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {KEY_OPTION: ctx.addShadow('sensing_keyoptions', 'KEY_OPTION', menuValue(m[1]))}}),
        toText: (block, readInput) => `<(${reverseMenu(readInput(block, 'KEY_OPTION', 'スペース'))} v) キーが押された>`
    },
    {
        opcode: 'sensing_mousedown',
        patterns: [/^< ?マウスが押された ?>$/u],
        boolean: true,
        toText: () => '<マウスが押された>'
    },
    {
        opcode: 'sensing_touchingobject',
        patterns: [/^< ?(.+?) に触れた ?>$/u],
        boolean: true,
        build: (m, ctx) => ({inputs: {TOUCHINGOBJECTMENU: ctx.addShadow('sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU', menuValue(m[1]))}}),
        toText: (block, readInput) => `<(${reverseMenu(readInput(block, 'TOUCHINGOBJECTMENU', 'マウスのポインター'))} v) に触れた>`
    },
    {
        opcode: 'sensing_touchingcolor',
        patterns: [/^< ?\[(#[0-9a-fA-F]{6})\] 色?に触れた ?>$/u],
        boolean: true,
        build: m => ({inputs: {COLOR: [1, [9, m[1]]]}}),
        toText: (block, readInput) => `<[${readInput(block, 'COLOR', '#ff0000')}] に触れた>`
    },
    {
        opcode: 'sensing_coloristouchingcolor',
        patterns: [/^< ?\[(#[0-9a-fA-F]{6})\] 色が \[(#[0-9a-fA-F]{6})\] 色に触れた ?>$/u],
        boolean: true,
        build: m => ({inputs: {COLOR: [1, [9, m[1]]], COLOR2: [1, [9, m[2]]]}}),
        toText: (block, readInput) => `<[${readInput(block, 'COLOR', '#ff0000')}] 色が [${readInput(block, 'COLOR2', '#00ff00')}] 色に触れた>`
    },
    {
        opcode: 'sensing_askandwait',
        patterns: [/^\[(.*?)\] と聞いて待つ$/u],
        build: m => ({inputs: {QUESTION: stringInput(m[1])}}),
        toText: (block, readInput) => `[${readInput(block, 'QUESTION', "What's your name?")}] と聞いて待つ`
    },
    {
        opcode: 'sensing_setdragmode',
        patterns: [/^ドラッグ \[(.+?)\] ようにする$/u],
        build: m => ({fields: {DRAG_MODE: [menuValue(m[1]), null]}}),
        toText: block => `ドラッグ [${reverseMenu(fieldValue(block, 'DRAG_MODE'))} v] ようにする`
    },
    {opcode: 'sensing_resettimer', patterns: [/^タイマーをリセット$/u], toText: () => 'タイマーをリセット'},
    {
        opcode: 'data_setvariableto',
        patterns: [/^\[(.+?)\] を (.+?) にする$/u],
        build: (m, ctx) => {
            const variable = ctx.variable(unwrap(m[1]));
            const incrementInput = selfUpdateValueInput(variable.name, m[2], ctx);
            if (incrementInput) {
                return {
                    opcode: 'data_changevariableby',
                    fields: {VARIABLE: [variable.name, variable.id]},
                    inputs: {VALUE: incrementInput}
                };
            }
            return {
                fields: {VARIABLE: [variable.name, variable.id]},
                inputs: {VALUE: valueBlockInput(m[2], ctx)}
            };
        },
        toText: (block, readInput) => `[${fieldValue(block, 'VARIABLE')} v] を ${roundInput(readInput(block, 'VALUE', '0'))} にする`
    },
    {
        opcode: 'data_changevariableby',
        patterns: [/^\[(.+?)\] を (.+?) ずつ変える$/u],
        build: (m, ctx) => {
            const variable = ctx.variable(unwrap(m[1]));
            return {
                fields: {VARIABLE: [variable.name, variable.id]},
                inputs: {VALUE: changeByValueInput(variable.name, m[2], ctx)}
            };
        },
        toText: (block, readInput) => `[${fieldValue(block, 'VARIABLE')} v] を ${roundInput(readInput(block, 'VALUE', '1'))} ずつ変える`
    },
    {
        opcode: 'data_showvariable',
        patterns: [/^変数 \[(.+?)\] を表示する$/u],
        build: (m, ctx) => {
            const variable = ctx.variable(unwrap(m[1]));
            return {fields: {VARIABLE: [variable.name, variable.id]}};
        },
        toText: block => `変数 [${fieldValue(block, 'VARIABLE')} v] を表示する`
    },
    {
        opcode: 'data_hidevariable',
        patterns: [/^変数 \[(.+?)\] を隠す$/u],
        build: (m, ctx) => {
            const variable = ctx.variable(unwrap(m[1]));
            return {fields: {VARIABLE: [variable.name, variable.id]}};
        },
        toText: block => `変数 [${fieldValue(block, 'VARIABLE')} v] を隠す`
    },
    {
        opcode: 'data_addtolist',
        patterns: [/^(.+?) を \[(.+?)\] に追加する$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[2]));
            return {
                fields: {LIST: [list.name, list.id]},
                inputs: {ITEM: valueBlockInput(m[1], ctx)}
            };
        },
        toText: (block, readInput) => `${roundInput(readInput(block, 'ITEM', 'thing'))} を [${fieldValue(block, 'LIST')} v] に追加する`
    },
    {
        opcode: 'data_deleteoflist',
        patterns: [/^\[(.+?)\] の (.+?) 番目を削除する$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {
                fields: {LIST: [list.name, list.id]},
                inputs: {INDEX: valueBlockInput(m[2], ctx)}
            };
        },
        toText: (block, readInput) => `[${fieldValue(block, 'LIST')} v] の ${roundInput(readInput(block, 'INDEX', '1'))} 番目を削除する`
    },
    {
        opcode: 'data_deletealloflist',
        patterns: [/^\[(.+?)\] のすべてを削除する$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}};
        },
        toText: block => `[${fieldValue(block, 'LIST')} v] のすべてを削除する`
    },
    {
        opcode: 'data_insertatlist',
        patterns: [/^(.+?) を \[(.+?)\] の (.+?) 番目に挿入する$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[2]));
            return {
                fields: {LIST: [list.name, list.id]},
                inputs: {ITEM: valueBlockInput(m[1], ctx), INDEX: valueBlockInput(m[3], ctx)}
            };
        },
        toText: (block, readInput) => `${roundInput(readInput(block, 'ITEM', 'thing'))} を [${fieldValue(block, 'LIST')} v] の ${roundInput(readInput(block, 'INDEX', '1'))} 番目に挿入する`
    },
    {
        opcode: 'data_replaceitemoflist',
        patterns: [/^\[(.+?)\] の (.+?) 番目を (.+?) で置き換える$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {
                fields: {LIST: [list.name, list.id]},
                inputs: {INDEX: valueBlockInput(m[2], ctx), ITEM: valueBlockInput(m[3], ctx)}
            };
        },
        toText: (block, readInput) => `[${fieldValue(block, 'LIST')} v] の ${roundInput(readInput(block, 'INDEX', '1'))} 番目を ${roundInput(readInput(block, 'ITEM', 'thing'))} で置き換える`
    },
    {
        opcode: 'data_showlist',
        patterns: [/^リスト \[(.+?)\] を表示する$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}};
        },
        toText: block => `リスト [${fieldValue(block, 'LIST')} v] を表示する`
    },
    {
        opcode: 'data_hidelist',
        patterns: [/^リスト \[(.+?)\] を隠す$/u],
        build: (m, ctx) => {
            const list = ctx.list(unwrap(m[1]));
            return {fields: {LIST: [list.name, list.id]}};
        },
        toText: block => `リスト [${fieldValue(block, 'LIST')} v] を隠す`
    },
    {
        opcode: 'event_broadcast',
        patterns: [/^(.+?) を送る$/u],
        build: m => {
            const name = unwrap(m[1]);
            return {inputs: {BROADCAST_INPUT: [1, [11, name, `broadcast_${name}`]]}};
        },
        toText: (block, readInput) => `(${readInput(block, 'BROADCAST_INPUT', 'メッセージ1')} v) を送る`
    },
    {
        opcode: 'event_broadcastandwait',
        patterns: [/^(.+?) を送って待つ$/u],
        build: m => {
            const name = unwrap(m[1]);
            return {inputs: {BROADCAST_INPUT: [1, [11, name, `broadcast_${name}`]]}};
        },
        toText: (block, readInput) => `(${readInput(block, 'BROADCAST_INPUT', 'メッセージ1')} v) を送って待つ`
    }
];

const specsByOpcode = blockSpecs.reduce((acc, spec) => {
    acc[spec.opcode] = spec;
    return acc;
}, {});

const officialIdOpcodeOverrides = {
    'LOOKS_NEXTBACKDROP_BLOCK': 'looks_nextbackdrop',
    'SOUND_SETEFFECTO': 'sound_seteffectto',
    'CONTROL_WAITUNTIL': 'control_wait_until',
    'CONTROL_REPEATUNTIL': 'control_repeat_until',
    'CONTROL_STARTASCLONE': 'control_start_as_clone',
    'CONTROL_CREATECLONEOF': 'control_create_clone_of',
    'CONTROL_DELETETHISCLONE': 'control_delete_this_clone',
    'SENSING_OF_XPOSITION': 'motion_xposition',
    'SENSING_OF_YPOSITION': 'motion_yposition',
    'SENSING_OF_DIRECTION': 'motion_direction',
    'SENSING_OF_COSTUMENUMBER': 'looks_costumenumbername',
    'SENSING_OF_SIZE': 'looks_size',
    'SENSING_OF_BACKDROPNAME': 'looks_backdropnumbername',
    'SENSING_OF_BACKDROPNUMBER': 'looks_backdropnumbername',
    'OPERATORS_LETTEROF': 'operator_letter_of',
    'DATA_VARIABLE': 'data_variable',
    'CONTROL_ELSE': null,
    'scratchblocks:end': null
};

const officialIdToOpcode = id => (
    Object.prototype.hasOwnProperty.call(officialIdOpcodeOverrides, id) ?
        officialIdOpcodeOverrides[id] :
        id.toLowerCase().replace(/^operators_/u, 'operator_')
);

const checkOfficialBlocks = (code, blocks) => {
    const analysis = analyzeScratchBlocks(code);
    const expectedCounts = analysis.knownBlockIds.reduce((counts, id) => {
        const opcode = officialIdToOpcode(id);
        if (!opcode) return counts;
        counts[opcode] = (counts[opcode] || 0) + 1;
        return counts;
    }, {});
    code.split('\n').forEach(line => {
        const normalizedLine = normalize(line);
        const variableAssignment = normalizedLine.match(/^\[(.+?)\] を (.+?) にする$/u);
        const coordinateAssignment = normalizedLine.match(/^(x座標|y座標)を (.+?) にする$/u);
        if (!variableAssignment && !coordinateAssignment) return;

        const targetName = unwrap((variableAssignment || coordinateAssignment)[1]);
        const expression = findBinaryExpression((variableAssignment || coordinateAssignment)[2]);
        if (!expression) return;
        const left = unwrap(expression.left);
        const right = unwrap(expression.right);
        const isSelfAdd = expression.opcode === 'operator_add' &&
            (left === targetName || right === targetName);
        const isSelfSubtract = expression.opcode === 'operator_subtract' && left === targetName;
        if (!isSelfAdd && !isSelfSubtract) return;

        expectedCounts[expression.opcode] = Math.max(0, (expectedCounts[expression.opcode] || 0) - 1);
        if (variableAssignment) {
            expectedCounts.data_setvariableto = Math.max(0, (expectedCounts.data_setvariableto || 0) - 1);
            expectedCounts.data_variable = Math.max(0, (expectedCounts.data_variable || 0) - 1);
            expectedCounts.data_changevariableby = (expectedCounts.data_changevariableby || 0) + 1;
        } else {
            const axis = targetName === 'x座標' ? 'x' : 'y';
            const setOpcode = `motion_set${axis}`;
            const positionOpcode = `motion_${axis}position`;
            const changeOpcode = `motion_change${axis}by`;
            expectedCounts[setOpcode] = Math.max(0, (expectedCounts[setOpcode] || 0) - 1);
            expectedCounts[positionOpcode] = Math.max(0, (expectedCounts[positionOpcode] || 0) - 1);
            expectedCounts[changeOpcode] = (expectedCounts[changeOpcode] || 0) + 1;
        }
    });
    const actualCounts = Object.values(blocks).reduce((counts, block) => {
        if (!block || Array.isArray(block) || block.shadow) return counts;
        counts[block.opcode] = (counts[block.opcode] || 0) + 1;
        if (block.opcode === 'control_if_else') {
            counts.control_if = (counts.control_if || 0) + 1;
        }
        return counts;
    }, {});
    const missingOpcodes = Object.keys(expectedCounts).filter(opcode => (
        !specsByOpcode[opcode] || (actualCounts[opcode] || 0) < expectedCounts[opcode]
    ));
    return {
        valid: analysis.unknownBlocks.length === 0 && missingOpcodes.length === 0,
        unknownBlocks: analysis.unknownBlocks,
        missingOpcodes
    };
};

const hasEveryOfficialBlock = (code, blocks) => checkOfficialBlocks(code, blocks).valid;

const completenessDiagnostic = (prefix, code, blocks) => {
    const result = checkOfficialBlocks(code, blocks);
    const details = [];
    if (result.unknownBlocks.length > 0) {
        details.push(`未知の記法: ${result.unknownBlocks.slice(0, 3).join(' / ')}`);
    }
    if (result.missingOpcodes.length > 0) {
        details.push(`変換できなかったブロック: ${result.missingOpcodes.slice(0, 5).join(', ')}`);
    }
    return `${prefix}: 未対応または不完全な構文があるため変更しませんでした。${details.length ? ` ${details.join(' ')}` : ''}`;
};

function blockInputFromText (value, ctx, acceptSpec = () => true) {
    const candidates = [normalize(value), `<${unwrap(value)}>`];
    for (const candidate of candidates) {
        for (const spec of blockSpecs) {
            if (spec.hat || spec.cBlock || !acceptSpec(spec)) {
                continue;
            }
            for (const pattern of spec.patterns) {
                const match = candidate.match(pattern);
                if (!match) {
                    continue;
                }
                const built = spec.build ? spec.build(match, ctx) : {};
                const id = ctx.uid();
                ctx.blocks[id] = {
                    opcode: spec.opcode,
                    next: null,
                    parent: null,
                    inputs: built.inputs || {},
                    fields: built.fields || {},
                    shadow: false,
                    topLevel: false
                };
                Object.values(ctx.blocks[id].inputs).forEach(input => {
                    const childId = Array.isArray(input) && typeof input[1] === 'string' ? input[1] : null;
                    if (childId && ctx.blocks[childId]) {
                        ctx.blocks[childId].parent = id;
                    }
                });
                return [2, id];
            }
        }
    }
    return null;
}

function booleanBlockInput (value, ctx) {
    const input = blockInputFromText(value, ctx, spec => spec.boolean);
    if (input) return input;

    const id = ctx.uid();
    ctx.blocks[id] = {
        opcode: 'operator_equals',
        next: null,
        parent: null,
        inputs: {
            OPERAND1: primitiveString('1'),
            OPERAND2: primitiveString('0')
        },
        fields: {},
        shadow: false,
        topLevel: false
    };
    return [2, id];
}

function addReporterBlock (ctx, opcode, inputs = {}, fields = {}) {
    const id = ctx.uid();
    ctx.blocks[id] = {
        opcode,
        next: null,
        parent: null,
        inputs,
        fields,
        shadow: false,
        topLevel: false
    };
    Object.values(inputs).forEach(input => {
        const childId = Array.isArray(input) && typeof input[1] === 'string' ? input[1] : null;
        if (childId && ctx.blocks[childId]) ctx.blocks[childId].parent = id;
    });
    return [2, id];
}

function stripOuterRoundBrackets (value) {
    const text = normalize(value);
    if (!text.startsWith('(') || !text.endsWith(')')) return text;

    let depth = 0;
    for (let index = 0; index < text.length; index++) {
        if (text[index] === '(') depth++;
        if (text[index] === ')') depth--;
        if (depth === 0 && index < text.length - 1) return text;
    }
    return depth === 0 ? text.slice(1, -1).trim() : text;
}

function repairLooseRoundBrackets (value) {
    let text = normalize(value);
    let balance = [...text].reduce((total, character) => (
        total + (character === '(' ? 1 : character === ')' ? -1 : 0)
    ), 0);
    while (balance > 0 && text.startsWith('(')) {
        text = text.slice(1).trim();
        balance--;
    }
    while (balance < 0 && text.endsWith(')')) {
        text = text.slice(0, -1).trim();
        balance++;
    }
    return text;
}

function removeMalformedGeneratedVariables (variables = {}) {
    return Object.keys(variables).reduce((result, id) => {
        const variable = variables[id];
        const name = Array.isArray(variable) ? String(variable[0]) : '';
        const repaired = repairLooseRoundBrackets(name);
        if (!id.startsWith('var_') || repaired === name) result[id] = variable;
        return result;
    }, {});
}

function mergeNamedData (existing = {}, generated = {}, blocks, fieldName) {
    const result = {...existing};
    Object.keys(generated).forEach(generatedId => {
        const value = generated[generatedId];
        const name = Array.isArray(value) ? value[0] : '';
        const existingId = Object.keys(existing).find(id => (
            Array.isArray(existing[id]) && existing[id][0] === name
        ));
        const finalId = existingId || generatedId;
        if (!existingId) result[finalId] = value;
        Object.values(blocks).forEach(block => {
            const field = block && block.fields && block.fields[fieldName];
            if (Array.isArray(field) && field[1] === generatedId) field[1] = finalId;
        });
    });
    return result;
}

function mergeCompiledProgram (target, compiledTarget) {
    const blocks = compiledTarget.blocks || {};
    target.blocks = blocks;
    target.variables = mergeNamedData(
        removeMalformedGeneratedVariables(target.variables),
        compiledTarget.variables,
        blocks,
        'VARIABLE'
    );
    target.lists = mergeNamedData(target.lists, compiledTarget.lists, blocks, 'LIST');
    target.broadcasts = {
        ...(target.broadcasts || {}),
        ...(compiledTarget.broadcasts || {})
    };
}

function findBinaryExpression (value) {
    const text = stripOuterRoundBrackets(value);
    const operatorOpcodes = {
        '+': 'operator_add',
        '-': 'operator_subtract',
        '*': 'operator_multiply',
        '/': 'operator_divide'
    };

    for (const operators of [['+', '-'], ['*', '/']]) {
        let depth = 0;
        for (let index = text.length - 1; index >= 0; index--) {
            if (text[index] === ')') depth++;
            if (text[index] === '(') depth--;
            if (depth !== 0 || !operators.includes(text[index])) continue;
            if (index === 0 || /[+\-*/]/u.test(text[index - 1])) continue;
            const left = text.slice(0, index).trim();
            const right = text.slice(index + 1).trim();
            if (left && right) return {opcode: operatorOpcodes[text[index]], left, right};
        }
    }
    return null;
}

function changeByValueInput (variableName, value, ctx) {
    const expression = findBinaryExpression(value);
    if (expression && expression.opcode === 'operator_add') {
        const left = unwrap(expression.left);
        const right = unwrap(expression.right);
        if (left === variableName) return valueBlockInput(expression.right, ctx, true, true);
        if (right === variableName) return valueBlockInput(expression.left, ctx, true, true);
    }
    return valueBlockInput(value, ctx, true);
}

function selfUpdateValueInput (variableName, value, ctx) {
    const expression = findBinaryExpression(value);
    if (!expression) return null;

    const left = unwrap(expression.left);
    const right = unwrap(expression.right);
    if (expression.opcode === 'operator_add') {
        if (left === variableName) return valueBlockInput(expression.right, ctx, true, true);
        if (right === variableName) return valueBlockInput(expression.left, ctx, true, true);
    }
    if (expression.opcode === 'operator_subtract' && left === variableName) {
        return addReporterBlock(ctx, 'operator_subtract', {
            NUM1: primitiveNumber('0'),
            NUM2: valueBlockInput(expression.right, ctx, true, true)
        });
    }
    return null;
}

function variableBlockInput (name, ctx) {
    const variable = ctx.variable(unwrap(name));
    return addReporterBlock(ctx, 'data_variable', {}, {
        VARIABLE: [variable.name, variable.id]
    });
}

function valueBlockInput (value, ctx, preferNumber = false, inferVariable = false) {
    const text = repairLooseRoundBrackets(value);
    const unwrapped = unwrap(text);
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(unwrapped)) return primitiveNumber(unwrapped);

    const expression = findBinaryExpression(text);
    if (expression) {
        return addReporterBlock(ctx, expression.opcode, {
            NUM1: valueBlockInput(expression.left, ctx, true, true),
            NUM2: valueBlockInput(expression.right, ctx, true, true)
        });
    }

    const reporter = blockInputFromText(text, ctx, spec => spec.reporter);
    if (reporter) return reporter;
    if (inferVariable && /^[^\d()[\]<>+\-*/]+$/u.test(unwrapped)) {
        return variableBlockInput(unwrapped, ctx);
    }
    return preferNumber ? primitiveNumber(unwrapped) : primitiveString(unwrapped);
}

const reverseMenu = value => {
    const found = Object.keys(menuValueMap).find(key => menuValueMap[key] === value);
    return found || value;
};

const fieldValue = (block, name, fallback = '') => {
    const field = block.fields && block.fields[name];
    return Array.isArray(field) ? field[0] : fallback;
};

class ScratchTextCompiler {
    constructor () {
        this.diagnostics = [];
    }

    uid () {
        return `ai_${Math.random().toString(36)
            .slice(2, 11)}`;
    }

    extractScratchBlocks (text) {
        const projectMatches = [];
        const projectRegex = /```scratch-project\s*([\s\S]*?)```/giu;
        let match = projectRegex.exec(text);
        while (match) {
            projectMatches.push(match[1].trim());
            match = projectRegex.exec(text);
        }
        if (projectMatches.length > 0) return projectMatches[projectMatches.length - 1];

        const legacyMatches = [];
        const legacyRegex = /```(?:scratch|scratchblocks)\s*([\s\S]*?)```|```\s*\n([\s\S]*?)```/giu;
        match = legacyRegex.exec(text);
        while (match) {
            legacyMatches.push((match[1] || match[2]).trim());
            match = legacyRegex.exec(text);
        }
        if (legacyMatches.length > 0) return legacyMatches[legacyMatches.length - 1];

        const lines = String(text || '').split('\n');
        const firstHeader = lines.findIndex(line => targetHeader(line));
        return firstHeader >= 0 ? lines.slice(firstHeader)
            .join('\n')
            .trim() : '';
    }

    compile (text, baseProject = null, targetId = null) {
        this.diagnostics = [];
        if (baseProject && this.hasTargetHeaders(text)) {
            return this.compileProject(text, baseProject);
        }
        const target = this.compileTarget(text);
        if (!baseProject) {
            return {
                targets: [target],
                meta: {semver: '3.0.0', vm: '0.2.0'},
                extensions: []
            };
        }
        const hasCompiledScripts = Object.values(target.blocks).some(block => block.topLevel);
        if ((!hasCompiledScripts || !hasEveryOfficialBlock(text, target.blocks)) && text.trim()) {
            this.diagnostics.push(completenessDiagnostic('現在のスプライト', text, target.blocks));
            return typeof baseProject === 'string' ?
                JSON.parse(baseProject) :
                JSON.parse(JSON.stringify(baseProject));
        }
        return this.mergeTargetIntoProject(baseProject, target, targetId);
    }

    hasTargetHeaders (text) {
        return text.split('\n').some(line => targetHeader(line));
    }

    splitTargetSections (text, targetNames = null) {
        const sections = [];
        let current = null;

        text.split('\n').forEach(line => {
            const header = targetHeader(line);
            if (header && (!targetNames || targetNames.includes(header[1].trim()))) {
                current = {name: header[1].trim(), code: []};
                sections.push(current);
            } else if (current) {
                current.code.push(line);
            }
        });

        return sections
            .map(section => ({...section, code: section.code.join('\n').trim()}));
    }

    compileProject (text, baseProject) {
        const project = typeof baseProject === 'string' ?
            JSON.parse(baseProject) :
            JSON.parse(JSON.stringify(baseProject));

        const targetNames = project.targets.map(target => (
            target.isStage ? 'Stage' : target.name
        ));
        const sections = this.splitTargetSections(text, targetNames);
        const latestSections = sections.filter((section, index) => (
            sections.map(candidate => candidate.name).lastIndexOf(section.name) === index
        ));
        latestSections.forEach(section => {
            const target = section.name === 'Stage' ?
                project.targets.find(candidate => candidate.isStage) :
                project.targets.find(candidate => candidate.name === section.name);
            if (!target) {
                this.diagnostics.push(`${section.name}: 対応するターゲットが見つからないため変更しませんでした。`);
                return;
            }
            const compiledTarget = this.compileTarget(section.code);
            const sectionLines = section.code.split('\n')
                .map(line => line.trim())
                .filter(Boolean);
            const targetAlreadyEmpty = !Object.values(target.blocks || {})
                .some(block => block && block.topLevel);
            if (sectionLines.length === 0 && targetAlreadyEmpty) {
                return;
            }
            const explicitlyEmpty = sectionLines.length > 0 && sectionLines
                .every(line => /^#\s*(?:ブロックなし|ここにブロック)$/u.test(line));
            const hasCompiledScripts = Object.values(compiledTarget.blocks)
                .some(block => block.topLevel);
            if (!explicitlyEmpty && (
                !hasCompiledScripts ||
                !hasEveryOfficialBlock(section.code, compiledTarget.blocks)
            )) {
                this.diagnostics.push(completenessDiagnostic(section.name, section.code, compiledTarget.blocks));
                return;
            }
            mergeCompiledProgram(target, compiledTarget);
        });

        return project;
    }

    getDiagnostics () {
        return this.diagnostics.slice();
    }

    compileTarget (text) {
        const blocks = {};
        const variables = {};
        const lists = {};
        const state = {
            blocks,
            variables,
            variable: name => {
                const existingId = Object.keys(variables).find(id => variables[id][0] === name);
                if (existingId) return {id: existingId, name};
                const id = `var_${name}`;
                variables[id] = [name, 0];
                return {id, name};
            },
            list: name => {
                const existingId = Object.keys(lists).find(id => lists[id][0] === name);
                if (existingId) return {id: existingId, name};
                const id = `list_${name}`;
                lists[id] = [name, []];
                return {id, name};
            },
            addShadow: (opcode, fieldName, value) => {
                const id = this.uid();
                blocks[id] = {
                    opcode,
                    next: null,
                    parent: null,
                    inputs: {},
                    fields: {[fieldName]: [value, null]},
                    shadow: true,
                    topLevel: false
                };
                return [1, id];
            },
            uid: () => this.uid()
        };

        const stack = [{parentId: null, inputName: null, lastId: null}];
        const lines = text.split('\n')
            .map(line => normalizeLine(line))
            .filter(line => line && !/^#/.test(line) && !/^\/\//.test(line));

        lines.forEach(line => {
            if (/^(end|エンド|終わり)$/iu.test(line)) {
                if (stack.length > 1) stack.pop();
                return;
            }
            if (/^(else|でなければ)$/iu.test(line)) {
                const current = stack[stack.length - 1];
                const parent = blocks[current.parentId];
                if (!parent || parent.opcode !== 'control_if') return;
                parent.opcode = 'control_if_else';
                stack[stack.length - 1] = {parentId: current.parentId, inputName: 'SUBSTACK2', lastId: null};
                return;
            }

            const specMatch = this.matchLine(line);
            if (!specMatch) return;

            const {spec, match} = specMatch;
            const built = spec.build ? spec.build(match, state) : {};
            const id = this.uid();
            const current = stack[stack.length - 1];
            if (spec.hat && stack.length === 1) {
                current.lastId = null;
            }
            const block = {
                opcode: built.opcode || spec.opcode,
                next: null,
                parent: null,
                inputs: built.inputs || {},
                fields: built.fields || {},
                shadow: false,
                topLevel: Boolean(spec.hat || (!current.parentId && !current.lastId))
            };

            if (block.topLevel) {
                block.x = 0;
                block.y = Object.keys(blocks).filter(key => blocks[key].topLevel).length * 120;
            }

            if (current.lastId) {
                blocks[current.lastId].next = id;
                block.parent = current.lastId;
            } else if (current.parentId) {
                const parent = blocks[current.parentId];
                parent.inputs[current.inputName || 'SUBSTACK'] = [2, id];
                block.parent = current.parentId;
            }

            blocks[id] = block;
            Object.values(block.inputs).forEach(input => {
                const childId = Array.isArray(input) && typeof input[1] === 'string' ? input[1] : null;
                if (childId && blocks[childId]) {
                    blocks[childId].parent = id;
                }
            });
            current.lastId = id;

            if (spec.cBlock) {
                stack.push({parentId: id, inputName: 'SUBSTACK', lastId: null});
            }
        });

        return {
            isStage: false,
            name: 'Sprite1',
            variables,
            lists,
            broadcasts: {},
            blocks,
            currentCostume: 0,
            costumes: [],
            sounds: []
        };
    }

    mergeTargetIntoProject (baseProject, compiledTarget, targetId = null) {
        const project = typeof baseProject === 'string' ?
            JSON.parse(baseProject) :
            JSON.parse(JSON.stringify(baseProject));
        if (!project.targets || project.targets.length === 0) {
            return project;
        }

        const target = project.targets.find(candidate => candidate.id === targetId) ||
            project.targets.find(candidate => !candidate.isStage) ||
            project.targets[0];

        mergeCompiledProgram(target, compiledTarget);
        return project;
    }

    matchLine (line) {
        const normalizedLine = normalize(line);
        for (const spec of blockSpecs) {
            for (const pattern of spec.patterns) {
                const match = normalizedLine.match(pattern);
                if (match) return {spec, match};
            }
        }
        return null;
    }

    projectToScratchBlocks (projectJson, targetId = null) {
        const project = typeof projectJson === 'string' ? JSON.parse(projectJson) : projectJson;
        if (!project || !project.targets) return '';

        const targets = targetId ?
            project.targets.filter(target => target.id === targetId) :
            project.targets;

        return targets.map(target => {
            const blocks = target.blocks || {};
            const scriptIds = Object.keys(blocks)
                .filter(id => blocks[id].topLevel)
                .sort((a, b) => (blocks[a].y || 0) - (blocks[b].y || 0));
            const scripts = scriptIds
                .map(id => this.stringifyStack(blocks, id, 0))
                .filter(Boolean)
                .join('\n\n');
            return `# ${target.isStage ? 'Stage' : target.name || 'Sprite'}\n${scripts || '# ブロックなし'}`;
        }).join('\n\n');
    }

    stringifyStack (blocks, startId) {
        const lines = [];
        let id = startId;
        while (id && blocks[id]) {
            const block = blocks[id];
            const line = this.stringifyBlock(blocks, block);
            if (line) lines.push(line);
            id = block.next;
        }
        return lines.join('\n');
    }

    stringifyBlock (blocks, block) {
        const spec = specsByOpcode[block.opcode];
        const readInput = (sourceBlock, name, fallback) => this.readInput(blocks, sourceBlock, name, fallback);
        if (!spec || !spec.toText) {
            return `${block.opcode} :: grey`;
        }

        const head = spec.toText(block, readInput);
        if (!spec.cBlock && block.opcode !== 'control_if_else') return head;

        const body = this.stringifySubstack(blocks, block, 'SUBSTACK');
        if (block.opcode === 'control_if_else') {
            const elseBody = this.stringifySubstack(blocks, block, 'SUBSTACK2');
            return `${head}\n${body}\nでなければ\n${elseBody}\nend`;
        }
        return `${head}\n${body}\nend`;
    }

    stringifySubstack (blocks, block, inputName) {
        const input = block.inputs && block.inputs[inputName];
        const childId = Array.isArray(input) ? input[1] : null;
        return childId && blocks[childId] ? this.stringifyStack(blocks, childId) : '# ここにブロック';
    }

    readInput (blocks, block, name, fallback = '') {
        const input = block.inputs && block.inputs[name];
        if (!Array.isArray(input)) return fallback;

        const direct = input.find(item => Array.isArray(item));
        if (direct) return direct[1];

        const childId = input.find(item => typeof item === 'string');
        if (childId && blocks[childId]) {
            const child = blocks[childId];
            const spec = specsByOpcode[child.opcode];
            if (!child.shadow && spec && spec.toText) {
                return spec.toText(child, (sourceBlock, inputName, childFallback) => (
                    this.readInput(blocks, sourceBlock, inputName, childFallback)
                ));
            }
            const fields = child.fields || {};
            const firstField = Object.keys(fields)[0];
            if (firstField && Array.isArray(fields[firstField])) return fields[firstField][0];
        }

        return fallback;
    }
}

export default new ScratchTextCompiler();
