'use client';

import React from 'react';
import { TileInstance, TileTypeId } from '@/types/mahjong';
import { getTileImagePath, TILE_NAMES } from '@/engine/tiles';

interface MahjongTileProps {
  tile:
    | TileInstance
    | {
        typeId: TileTypeId;
        isWildcard?: boolean;
        isRed?: boolean;
        isGlass?: boolean;
        isBack?: boolean;
        isGold?: boolean;
        isWhitePocchi?: boolean;
      };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  isTsumo?: boolean;
  isDora?: boolean;
  isYoko?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  substitutedLabel?: string; // アガリ時にマイティが何に化けたか表示用
}

const SIZE_CLASSES = {
  xs: 'w-7 h-10 text-xs rounded-[4px]',
  sm: 'w-9 h-[50px] text-sm rounded-[5px]',
  md: 'w-11 h-[60px] sm:w-12 sm:h-[66px] text-base rounded-md',
  lg: 'w-14 h-[76px] text-lg rounded-lg',
};

const YOKO_SIZE_CLASSES = {
  xs: 'w-10 h-7 text-xs rounded-[4px]',
  sm: 'w-[50px] h-9 text-sm rounded-[5px]',
  md: 'w-[60px] h-11 sm:w-[66px] sm:h-12 text-base rounded-md',
  lg: 'w-[76px] h-14 text-lg rounded-lg',
};

export const MahjongTile: React.FC<MahjongTileProps> = ({
  tile,
  size = 'md',
  selected = false,
  isTsumo = false,
  isDora = false,
  isYoko = false,
  onClick,
  disabled = false,
  className = '',
  substitutedLabel,
}) => {
  const sizeClass = isYoko ? YOKO_SIZE_CLASSES[size] : SIZE_CLASSES[size];

  // ★マイティ牌（ワイルドカード）
  if (tile.isWildcard) {
    return (
      <button
        type="button"
        disabled={disabled || !onClick}
        onClick={onClick}
        title="★マイティ牌（全34種のどの牌としても使える万能牌）"
        className={`relative flex flex-col items-center justify-center select-none border-2 border-amber-400 bg-gradient-to-br from-slate-900 via-amber-950 to-slate-900 text-amber-300 mighty-glow transition-transform duration-150 ${sizeClass} ${
          onClick && !disabled ? 'cursor-pointer hover:-translate-y-1.5' : 'cursor-default'
        } ${className}`}
      >
        <span className="text-[1.15em] leading-none drop-shadow-[0_0_6px_rgba(251,191,36,0.9)]">
          ★
        </span>
        <span className="text-[9px] sm:text-[10px] font-black tracking-tighter text-amber-200 mt-0.5">
          {substitutedLabel || '万能'}
        </span>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500/80 rounded-b-sm" />
      </button>
    );
  }

  // 鷲巣麻雀などの非公開・黒牌（裏向き）
  if (tile.isBack) {
    return (
      <button
        type="button"
        disabled={disabled || !onClick}
        onClick={onClick}
        title="非公開の黒牌（不透明牌）"
        className={`relative flex flex-col items-center justify-center select-none border border-slate-700 bg-gradient-to-b from-slate-800 via-slate-900 to-black text-slate-400 shadow-md transition-all duration-150 ${sizeClass} ${
          selected ? '-translate-y-3 ring-2 ring-amber-400 z-10' : ''
        } ${onClick && !disabled ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'} ${
          isTsumo ? 'ml-2 sm:ml-3' : ''
        } ${className}`}
      >
        <div className="w-[76%] h-[78%] rounded-[3px] border border-slate-600/60 bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center">
          <span className="text-amber-400/80 font-black text-xs sm:text-sm">？</span>
        </div>
        <div className="absolute inset-x-0 -bottom-[3px] h-[3px] bg-slate-950 rounded-b-[4px] pointer-events-none" />
      </button>
    );
  }

  const typeId = tile.typeId;
  const isRed = Boolean(tile.isRed);
  const isGlass = Boolean(tile.isGlass);
  const isGold = Boolean(tile.isGold);
  const isWhitePocchi = Boolean(tile.isWhitePocchi);

  const imgSrc = getTileImagePath(typeId, isRed, 'l', isYoko);
  const tileLabel = typeId >= 0 && typeId < 34 ? TILE_NAMES[typeId] : '牌';

  const baseStyle = isGlass
    ? 'bg-cyan-100/20 backdrop-blur-[2px] border-cyan-200/70 shadow-[0_4px_14px_rgba(34,211,238,0.22),inset_0_1px_4px_rgba(255,255,255,0.6)]'
    : isGold
    ? 'bg-gradient-to-b from-amber-100 via-yellow-200 to-amber-300 border-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
    : 'bg-white border-stone-300 shadow-[0_2px_4px_rgba(0,0,0,0.45)]';

  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      title={`${tileLabel}${isRed ? '（赤ドラ）' : ''}${isGold ? '（金牌・祝儀）' : ''}${
        isWhitePocchi ? '（白ポッチ）' : ''
      }${isGlass ? '（透明ガラス牌）' : ''}`}
      className={`relative flex items-center justify-center select-none border overflow-visible transition-all duration-150 ${sizeClass} ${baseStyle} ${
        selected
          ? '-translate-y-3 ring-2 ring-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.7)] z-10'
          : onClick && !disabled
          ? 'cursor-pointer hover:-translate-y-1.5 hover:ring-1 hover:ring-amber-300/80'
          : 'cursor-default'
      } ${isTsumo ? 'ml-2 sm:ml-3' : ''} ${className}`}
    >
      {/* 牌の側面・底面の立体感 */}
      {!isGlass ? (
        <div
          className={`absolute inset-x-0 -bottom-[3px] h-[3px] rounded-b-[4px] pointer-events-none ${
            isGold ? 'bg-amber-600' : 'bg-amber-600/85'
          }`}
        />
      ) : (
        <div className="absolute inset-x-0 -bottom-[3px] h-[3px] bg-cyan-400/35 rounded-b-[4px] pointer-events-none" />
      )}

      {/* 牌画像 */}
      <img
        src={imgSrc}
        alt={tileLabel}
        draggable={false}
        className={`w-full h-full object-contain rounded-[3px] pointer-events-none select-none ${
          isGlass ? 'opacity-70 mix-blend-screen brightness-110 contrast-125' : ''
        } ${isGold ? 'mix-blend-multiply brightness-105 contrast-110' : ''}`}
      />

      {/* ガラス牌の光沢ハイライト */}
      {isGlass && (
        <div className="absolute inset-0 rounded-[4px] bg-gradient-to-tr from-transparent via-white/25 to-cyan-200/35 pointer-events-none" />
      )}

      {/* 白ポッチの中央ダイヤ */}
      {isWhitePocchi && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-2.5 h-2.5 rotate-45 bg-sky-500 border border-sky-200 shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
        </span>
      )}

      {/* ドラ・赤・金インジケータ */}
      {(isRed || isDora || isGold) && (
        <span
          className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm pointer-events-none ${
            isGold
              ? 'bg-amber-400 ring-1 ring-yellow-200'
              : isRed
              ? 'bg-rose-500'
              : 'bg-amber-400'
          }`}
        />
      )}
    </button>
  );
};
