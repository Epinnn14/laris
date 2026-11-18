// The notes board on its own page: sticky notes on cork, placed wherever the owner likes.
import { t, useLang } from "../i18n";
import { PageHead } from "../ui";
import { CorkBoard } from "./Corkboard";

export default function Catatan() {
  useLang();
  return (
    <>
      <PageHead title={t("Papan catatan")} sub={t("Tulis apa saja: nomor pemasok, rencana menu baru, siapa yang masih utang.")} />
      <CorkBoard />
    </>
  );
}
