import type { SimEvent, PlotId } from '../sim';
import './rewards.css';

export interface RewardLayer {
  /** Shows harvest, combo and watering feedback for one batch of sim events (motion.md 4.4–4.6). */
  onEvents(events: readonly SimEvent[], reducedMotion: boolean): void;
  dispose(): void;
}

export interface RewardLayerOptions {
  /** Screen point above a plot, or null when it is off screen. */
  readonly projectPlot: (plotId: PlotId) => { x: number; y: number } | null;
  /** The coin counter the flying coins head for. */
  readonly coinTarget: () => HTMLElement | null;
}

const MAX_FLYING_COINS = 8;

/** DOM overlay for rewards: it only reacts to sim events and never decides them. */
export function createRewardLayer(container: HTMLElement, options: RewardLayerOptions): RewardLayer {
  const layer = document.createElement('div');
  layer.className = 'rewards';
  layer.setAttribute('aria-hidden', 'true');
  container.append(layer);
  let flying = 0;
  const luckyPool: { coin: HTMLSpanElement; active: boolean }[] = [];

  function floatLabel(text: string, x: number, y: number, kind: string, reducedMotion: boolean): void {
    const label = document.createElement('span');
    label.className = `rewards__label rewards__label--${kind}`;
    label.textContent = text;
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    layer.append(label);
    const animation = label.animate(reducedMotion
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
      : [
        { opacity: 0, transform: 'translate(-50%, -20%) scale(0.6)' },
        { opacity: 1, transform: 'translate(-50%, -60%) scale(1.15)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-50%, -110%) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, -150%) scale(0.95)' },
      ], { duration: reducedMotion ? 900 : 800, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' });
    animation.onfinish = () => label.remove();
  }

  function flyCoins(count: number, x: number, y: number, reducedMotion: boolean): void {
    const target = options.coinTarget()?.getBoundingClientRect();
    if (!target || reducedMotion) {
      bumpCounter(reducedMotion);
      return;
    }
    const tx = target.left + 26;
    const ty = target.top + target.height / 2;
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      if (flying >= MAX_FLYING_COINS) break;
      flying += 1;
      const coin = document.createElement('span');
      coin.className = 'rewards__coin';
      coin.style.left = `${x}px`;
      coin.style.top = `${y}px`;
      layer.append(coin);
      const spread = (index - (Math.min(count, 5) - 1) / 2) * 16;
      const animation = coin.animate([
        { transform: 'translate(-50%, -50%) scale(0.4) rotateY(0deg)' },
        { transform: `translate(calc(-50% + ${spread}px), calc(-50% - 46px)) scale(1.1) rotateY(180deg)`, offset: 0.3 },
        { transform: `translate(calc(-50% + ${tx - x}px), calc(-50% + ${ty - y}px)) scale(0.7) rotateY(360deg)` },
      ], { duration: 620, delay: 120 + index * 45, easing: 'cubic-bezier(0.5, 0, 0.7, 1)', fill: 'backwards' });
      animation.onfinish = () => {
        coin.remove();
        flying -= 1;
        bumpCounter(false);
      };
    }
  }

  function bumpCounter(reducedMotion: boolean): void {
    if (reducedMotion) return;
    options.coinTarget()?.animate([
      { transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' },
    ], { duration: 160, easing: 'ease-out' });
  }

  return {
    onEvents(events, reducedMotion) {
      for (const event of events) {
        if (event.type === 'Harvested') {
          const point = options.projectPlot(event.plotId);
          if (!point) continue;
          // Labels sit above the plant so the fruit's flight to the crate stays visible.
          const mutations = event.mutations ?? [];
          const label = mutations.length ? `+${event.coins} ${mutations.map((id) => `${id[0]!.toUpperCase()}${id.slice(1)}`).join(' + ')} x${mutations.reduce((v, id) => v * ({ giant: 2, golden: 4, glowing: 3, crystal: 6, rainbow: 10 } as const)[id], 1)}` : `+${event.coins}`;
          floatLabel(label, point.x, point.y - 44, 'coins', reducedMotion);
          const note = event.size === 'big' ? 'Big' : event.fresh ? 'Fresh' : null;
          if (note) floatLabel(note, point.x, point.y - 74, 'note', reducedMotion);
          flyCoins(event.coins, point.x, point.y, reducedMotion);
          if (event.lucky) {
            if (reducedMotion) floatLabel('Lucky!', point.x, point.y - 98, 'note', true);
            else for (let i = 0; i < 12; i += 1) {
              let pooled = luckyPool.find(({ active }) => !active);
              if (!pooled && luckyPool.length < 12) {
                const coin = document.createElement('span'); coin.className = 'rewards__coin rewards__coin--lucky';
                layer.append(coin); pooled = { coin, active: false }; luckyPool.push(pooled);
              }
              if (!pooled) break;
              pooled.active = true;
              const coin = pooled.coin;
              coin.style.left = `${point.x}px`; coin.style.top = `${point.y}px`;
              coin.style.opacity = '1';
              const target = options.coinTarget()?.getBoundingClientRect();
              const spread = (i - 5.5) * 12;
              const destination = target
                ? `translate(calc(-50% + ${target.left + 26 - point.x + spread}px), calc(-50% + ${target.top + target.height / 2 - point.y}px)) scale(.55)`
                : `translate(calc(-50% + ${spread}px), calc(-50% - 70px)) scale(.8)`;
              const animation = coin.animate([
                { transform: 'translate(-50%, -50%) scale(.5)', opacity: 1 },
                { transform: `translate(calc(-50% + ${spread}px), calc(-50% - 54px)) scale(1)`, opacity: 1, offset: 0.3 },
                { transform: destination, opacity: 0 },
              ], { duration: 780, delay: i * 28, fill: 'both' });
              animation.onfinish = () => { animation.cancel(); coin.style.opacity = '0'; pooled.active = false; };
            }
          }
        } else if (event.type === 'HarvestCompleted' && event.count > 1) {
          const banner = document.createElement('div');
          banner.className = 'rewards__combo';
          banner.textContent = `Combo x${event.count}`;
          if (event.comboBonus > 0) {
            const bonus = document.createElement('span');
            bonus.textContent = ` +${event.comboBonus}`;
            banner.append(bonus);
          }
          layer.append(banner);
          const animation = banner.animate(reducedMotion
            ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
            : [
              { opacity: 0, transform: 'translate(-50%, -40px) rotate(-6deg) scale(1.6)' },
              { opacity: 1, transform: 'translate(-50%, 0) rotate(-3deg) scale(1)', offset: 0.15 },
              { opacity: 1, transform: 'translate(-50%, 0) rotate(-3deg) scale(1)', offset: 0.8 },
              { opacity: 0, transform: 'translate(-50%, -12px) rotate(-3deg) scale(0.95)' },
            ], { duration: 1100, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
          animation.onfinish = () => banner.remove();
        } else if (event.type === 'Watered') {
          const point = options.projectPlot(event.plotId);
          if (point) floatLabel('Watered', point.x, point.y, 'note', reducedMotion);
        }
      }
    },
    dispose() {
      layer.remove();
    },
  };
}
