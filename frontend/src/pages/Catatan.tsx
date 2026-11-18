// The notes board on its own page, one tap from the menu.
import { t, useLang } from "../i18n";
import { PageHead } from "../ui";
import { NotesBoard } from "./BerandaExtras";

export default function Catatan() {
  useLang();
  return (
    <>
      <PageHead title={t("Papan catatan")} sub={t("Tulis apa saja: nomor pemasok, rencana menu baru, siapa yang masih utang.")} />
      <NotesBoard bare />
    </>
  );
}
