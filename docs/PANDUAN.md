# Panduan Laris untuk pemilik usaha

Laris membantu warung makan dan kafe menjawab tiga pertanyaan harian:

1. **Bagaimana jualan saya?** Lihat omzet, laba kotor, menu terlaris, dan hari ramai atau sepi.
2. **Besok dan minggu depan kira-kira laku berapa?** Lihat prediksi per menu dan total omzet.
3. **Saya harus belanja apa, berapa banyak?** Lihat daftar belanja dari prediksi, resep, dan stok.

Semua angka dihitung di komputer atau server Anda sendiri. Tidak ada data yang dikirim ke pihak lain.

## 1. Mulai: buat akun

Pertama kali dibuka, Laris menanyakan empat hal. Semuanya bisa diubah nanti di **Pengaturan**.

1. **Tentang usaha:** nama usaha, nama pemilik, jenis usaha (warung makan, kafe, atau kios / toko kelontong), dan kota.
2. **Cara berjualan:** hari buka, seberapa sering belanja bahan, target omzet per bulan, dan untung yang diinginkan dari harga jual.
3. **Mulai dari mana:**
   - **data contoh setahun** untuk mencoba semua halaman (khusus warung makan dan kafe),
   - **pilih menu dari contoh**, lengkap dengan resep dan bahan, tinggal sesuaikan harga,
   - atau **mulai kosong**.
4. **Kata sandi** (minimal 6 karakter), dipakai untuk masuk dari HP atau laptop lain.

Tombol **EN/ID** dan **bulan/matahari** di pojok atas mengganti bahasa (Indonesia atau Inggris) dan tampilan (terang atau gelap). Tampilan awalnya terang.

Untuk kios / toko kelontong, setiap barang adalah stoknya sendiri: satu terjual berarti satu berkurang dari rak. Model prediksi dilatih dengan pola warung dan kafe, jadi untuk kios ia memakai pola warung makan.

## 2. Menu, modal, dan bahan

Cara paling mudah mengisi modal: isi **uang belanja** dan **jadi berapa porsi siap jual**. Contoh: belanja Rp120.000 untuk satu panci soto, jadi 30 porsi, berarti modalnya Rp4.000 per porsi. Untuk barang jadi di kios, isi harga satu dus dan isinya.

Kalau ingin stok bahan berkurang otomatis dan muncul di daftar belanja, buka **Hubungkan ke stok bahan (opsional)** lalu isi bahan per porsi:

- **Resep per porsi** artinya berapa gram, ml, atau buah bahan untuk satu porsi. Contoh: Nasi Goreng = beras 150 g, ayam 50 g, telur 1 buah.
- Menu yang untungnya di bawah target dari Pengaturan (20%, 40%, 50%, 60%, atau 80%) ditandai kuning, dan kolom **Saran harga** menunjukkan harga yang sesuai target.
- Setiap bahan punya isian berikut:
  - **Isi dan harga satu kemasan**, misalnya karung 5 kg seharga Rp70.000.
  - **Tahan berapa hari**. Ayam segar 2 hari, beras 180 hari.
  - **Datang setelah berapa hari**. Isi 0 kalau bisa dibeli langsung; isi 3 kalau biji kopi dipesan online.

## 3. Kasir: catat tiap orderan

Untuk toko yang ramai, buka **Kasir** di HP atau laptop:

1. Ketuk menu yang dipesan. Ketuk lagi untuk menambah porsi.
2. Pilih cara bayar: **Tunai**, **QRIS**, atau **Transfer**. Untuk tunai, isi uang yang diterima atau ketuk **Uang pas** / **Rp50 rb**, dan kembaliannya langsung terlihat.
3. Tekan **Simpan orderan**.

Setiap orderan langsung menambah penjualan hari itu dan mengurangi stok bahan. Halaman **Catat** ikut menampilkan totalnya. Orderan yang salah bisa **Dibatalkan** dari daftar "Orderan hari ini". Beberapa HP boleh dipakai bersamaan.

Di Beranda muncul baris **Hari ini dari kasir** (omzet dan jumlah orderan sejauh ini) dan grafik **Jam berapa paling ramai?**.

## 4. Catat penjualan setiap hari (tanpa kasir)

Buka **Catat**, isi jumlah porsi tiap menu dengan tombol − dan +, lalu tekan **Simpan**.

- **Stok bahan berkurang otomatis** sesuai resep. Kalau angka penjualan diubah, stok ikut dihitung ulang.
- Centang **"Habis duluan"** kalau menu itu habis sebelum toko tutup. Dengan begitu Laris tahu permintaan sebenarnya lebih tinggi.
- Centang **"Promo"** kalau menu sedang dipromosikan.
- Centang **"Tutup hari ini"** kalau tidak buka. Hari tutup tidak dianggap hari sepi.
- Hari yang terlewat muncul sebagai pengingat **"Belum dicatat"** di Beranda dan di halaman Catat.

## 5. Stok bahan

- **Beli**: catat saat belanja. Tombol cepat "1 × karung 5 kg" mengisi jumlah dan perkiraan harga.
- **Hitung stok**: isi jumlah yang benar-benar ada di dapur. Laris menyesuaikan catatannya. Sebaiknya lakukan seminggu sekali.
- **Buang**: catat bahan yang basi atau rusak. Totalnya muncul di Beranda sebagai "bahan terbuang".
- Warna stok: **merah** artinya akan habis sebelum barang baru datang, **kuning** artinya menipis, **hijau** artinya aman.

## 6. Prediksi

Prediksi muncul setelah sekitar **7 hari** penjualan tercatat, dan makin akurat setelah 8 minggu.
Model LarisNet membaca pola berikut:

- hari dalam seminggu (warung dekat kantor sepi hari Minggu, kafe ramai akhir pekan),
- tanggal gajian dan tanggal tua,
- **Ramadan, Lebaran, dan minggu-minggu setelahnya** (tanggal bergeser setiap tahun, dan Laris menghitungnya sendiri),
- libur nasional dan libur panjang,
- menu baru yang sedang naik daun,
- promo dan hari tutup yang Anda rencanakan.

**Cara membaca grafik:** garis menunjukkan perkiraan tengah. Area berwarna adalah kisaran yang hampir pasti, sebab 8 dari 10 hari jatuh di sini. Kotak biru di atas grafik menunjukkan seberapa meleset prediksi 4 minggu lalu dibanding yang terjadi.

**Rencana tutup dan promo** (bagian bawah halaman Prediksi): isi tanggal mudik, libur, atau promo. Prediksi dan daftar belanja langsung menyesuaikan.

## 7. Daftar belanja

Laris menghitung berapa bahan yang terpakai sampai barang berikutnya datang, dibandingkan dengan stok yang ada.

- **Belanja setiap**: pilih seberapa sering Anda belanja, misalnya setiap hari ke pasar atau seminggu sekali ke grosir.
- **Seberapa aman**:
  - **Hemat** artinya modal lebih sedikit, tapi kadang bahan habis.
  - **Aman** artinya jarang kehabisan, tapi lebih banyak uang tertahan di stok.
- Bahan yang **cepat basi** tidak disarankan lebih banyak dari yang akan terpakai sebelum rusak.
- **Salin untuk WhatsApp**: daftar siap dikirim ke pemasok atau ke orang yang belanja.
- Tekan **Sudah dibeli** setelah belanja, supaya stok bertambah.

## 8. Pengeluaran dan untung bersih

Buka **Pengeluaran** untuk mencatat gas, listrik dan air, sewa, gaji, kemasan, serta bensin dan ongkir. Bahan tidak perlu dicatat di sini karena sudah tercatat di Stok.

Beranda lalu menghitung seperti buku kas:

| | |
|---|---|
| Uang masuk dari penjualan | |
| − modal bahan untuk porsi yang terjual | dari resep |
| − bahan terbuang | dari Stok |
| − biaya lain | dari Pengeluaran |
| **= untung bersih** | |

Di bawahnya ada garis "dari setiap Rp100.000 yang masuk", supaya kelihatan berapa yang jadi bahan, biaya, dan untung.

## 9. Target bulanan

Kalau target omzet diisi, Beranda menunjukkan:

- berapa yang sudah masuk,
- perkiraan akhir bulan,
- berapa yang perlu didapat per hari buka,
- dan kemungkinan target tercapai (kecil, setengah-setengah, atau besar).

## 10. Ringkasan minggu

Halaman **Ringkasan minggu** merangkum 7 hari terakhir dalam kalimat biasa:

- omzet dan untung dibanding minggu sebelumnya,
- menu yang naik dan turun,
- menu paling laku,
- yang perlu diperhatikan (menu habis duluan, bahan terbuang, untung di bawah target, hari yang belum dicatat),
- saran penjualan minggu depan (menu yang sedang naik, yang perlu promo, hari paling ramai dan paling sepi, harga yang perlu dinaikkan),
- perkiraan minggu depan dan bahan yang paling mendesak dibeli.

Tekan **Salin untuk WhatsApp** untuk mengirimnya ke keluarga atau rekan usaha.

## 11. Coba hitung: kalau…

Pilih satu menu, lalu coba:

- **harga baru**, misalnya naik Rp1.000,
- dan/atau **promo** di tanggal tertentu.

Laris membandingkan 4 minggu ke depan "sekarang" dengan "kalau". Hasilnya berupa porsi menu itu, omzet seluruh menu, dan untung setelah modal bahan.

- Efek promo dihitung oleh model.
- Efek harga adalah perkiraan kasar dari pilihan **seberapa peka pembeli pada harga**, karena Laris belum pernah melihat harga di tokomu berubah.

Tidak ada yang berubah sampai kamu sendiri mengubah harga di Menu.

Di halaman **Menu & resep**, kolom **Saran harga** menunjukkan harga yang memberi untung sesuai target dari Pengaturan.

## 12. Pesanan di luar jualan harian

Untuk nasi kotak, katering, atau pesanan acara, buka **Pesanan → Pesanan baru**. Isi:

- nama pemesan dan nomor WhatsApp,
- tanggal dan jam diambil atau diantar,
- isi pesanan (pilih dari menu atau tulis sendiri; harganya boleh berbeda, misalnya harga paket),
- uang muka (DP).

Laris lalu:

- menampilkan pesanan yang harus siap hari ini atau besok di **Yang perlu dilakukan** dan di kotak **Pesanan** di Beranda,
- memasukkan bahannya ke **Daftar belanja** sebelum hari H,
- setelah pesanan ditandai **Selesai**, mengurangi stok bahannya dan menghitung uangnya di untung bersih.

Pesanan tidak dipakai untuk prediksi, karena bukan pola jualan harian.

## 13. Papan catatan

Di Beranda ada **Papan catatan** untuk menulis apa saja: nomor pemasok, rencana menu baru, siapa yang masih utang. Catatan bisa **disematkan** supaya selalu di atas, diubah, atau dihapus.

## 14. Memakai dari HP

Kalau Laris jalan di laptop toko, HP yang tersambung ke WiFi yang sama cukup memindai kode QR di jendela Laris (lihat [PASANG.md](PASANG.md)).
Kalau Laris dipasang online (lihat [DEPLOY.md](DEPLOY.md)), cukup buka alamatnya dari mana saja dan masuk dengan kata sandi.

## 15. Data Anda

- **Unduh laporan** (di Ringkasan minggu dan Pengaturan): pilih Seminggu, Sebulan, atau Setahun. Nama filenya
  `<nama toko>-hasil seminggu.csv`, `<nama toko>-hasil sebulan <bulan> <tahun>.csv`, atau
  `<nama toko>-hasil setahun <tahun>.csv`. Isinya: ringkasan (omzet, modal bahan, bahan terbuang, pengeluaran,
  untung bersih), keterangan per minggu (naik/turun, menu paling laku, hari paling ramai, hari yang belum dicatat),
  hasil per hari atau per bulan, per menu, dan pengeluaran per jenis. Bisa dibuka di Excel atau Google Sheets.
- **Pengaturan → Unduh semua penjualan (CSV)**: satu baris per menu per hari, sejak awal.
- **Bahan sendiri**: di Stok bahan tekan **Bahan baru**, atau **Ubah** untuk mengganti nama, kemasan, dan harga.
  Bahan yang tidak dipakai lagi bisa dihilangkan centang "Masih dipakai" (muncul di pilihan **Tidak dipakai**,
  bisa **Pakai lagi**) atau **Hapus bahan**: dikeluarkan dari semua resep; kalau pernah dibeli, catatannya tetap ada.
- Di laptop, data tersimpan di volume Docker `laris-data`. Online, data tersimpan di database Postgres milik Anda.
