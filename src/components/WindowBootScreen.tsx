import logoXos from "../assets/logo-xos.png";
import "./boot.css";

type WindowBootScreenProps = {
  label?: string;
};

/**
 * Loader compact style BootScreen, affiché DANS une fenêtre pendant qu'elle
 * charge (lazy chunk ou fetch params). Pas de backdrop plein écran ni z-index
 * 20000 — la fenêtre fournit déjà son cadre.
 */
export function WindowBootScreen({ label = "Ouverture…" }: WindowBootScreenProps) {
  return (
    <div className="xos-window-boot" role="status" aria-live="polite" aria-busy="true">
      <div className="xos-window-boot__ring" aria-hidden="true" />
      <div className="xos-window-boot__content">
        <div className="xos-window-boot__logo-wrap">
          <img
            src={logoXos}
            alt=""
            className="xos-window-boot__logo"
            width={880}
            height={334}
            decoding="async"
            aria-hidden="true"
          />
        </div>
        <div className="xos-window-boot__progress" aria-hidden="true">
          <div className="xos-window-boot__progress-track">
            <div className="xos-window-boot__progress-fill" />
          </div>
        </div>
        <p className="xos-window-boot__status">{label}</p>
      </div>
    </div>
  );
}