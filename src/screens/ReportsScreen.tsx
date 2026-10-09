import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Badge, Btn, Card, Empty, Muted, SectionHeader } from '../components/ui';
import { DateField, isDate } from '../components/pickers';
import { showDialog, showToast } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { useNow } from '../components/useNow';
import { programDayKey } from '../utils/period';
import { fmtDateTime } from '../utils/format';
import { toCsv } from '../utils/csv';
import { exportCsv } from '../utils/export';
import { attendanceRows, billingLines, billingRows } from '../utils/exports';
import { OPS_ROLES } from '../config';
import { C, SP, T } from '../theme';
import type { DailyReport } from '../types';

const shiftDay = (key: string, delta: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

/**
 * Daily report (R12: built 06:00 WIB, published by the PIC by 10:00; Grab sees published ones only),
 * plus the CSV exports: attendance detail for Grab, payroll detail for back office (R15), and the
 * validated SPG-days recap the monthly invoice is reconciled against (R13).
 */
export default function ReportsScreen() {
  const me = useCurrentUser();
  const s = useStore();
  const today = programDayKey(useNow());
  const yesterday = shiftDay(today, -1);
  const isOps = !!me && OPS_ROLES.includes(me.role);
  const isStaff = !!me && ['super_admin', 'pic', 'back_office'].includes(me.role);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const campaignLabel = (key: string) => {
    for (const c of s.campaigns) {
      const f = c.kpiFields.find((x) => x.key === key);
      if (f) return f.label;
    }
    return key;
  };

  const publish = async (date: string) => {
    setBusy(`pub-${date}`);
    try {
      await s.publishDailyReport(date);
      showToast(`Laporan ${date} terbit — Grab sudah bisa membaca`);
    } catch (e) {
      showDialog('Gagal Menerbitkan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doExport = async (kind: 'attendance' | 'payroll' | 'billing') => {
    if (!isDate(from) || !isDate(to) || to < from) return showDialog('Periode Tidak Valid', 'Isi tanggal dari dan sampai (TTTT-BB-HH).');
    setBusy(kind);
    try {
      const data = await s.fetchExportData(from, to);
      if (kind === 'billing') {
        const month = from.slice(0, 7);
        if (to.slice(0, 7) !== month) throw new Error('Rekap tagihan per bulan: pilih tanggal dalam satu bulan.');
        await exportCsv(`rekap-tagihan-${month}`, toCsv(billingRows(billingLines(data, month))));
      } else {
        const rows = attendanceRows(data, from, to, kind === 'payroll');
        await exportCsv(`${kind === 'payroll' ? 'payroll' : 'kehadiran'}-${from}-${to}`, toCsv(rows));
      }
    } catch (e) {
      showDialog('Gagal Ekspor', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* keep */ } finally { setRefreshing(false); }
  };

  const reportCard = (r: DailyReport) => (
    <Card key={r.date} style={{ marginBottom: SP.sm, gap: SP.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={T.label}>{r.date}</Text>
        <Badge label={r.publishedAt ? `Terbit ${fmtDateTime(r.publishedAt)}` : 'Draf'} color={r.publishedAt ? C.ok : C.warn} />
      </View>
      <Text style={T.body}>
        Terjadwal {r.totals.planned} · hadir {r.totals.attended} · tidak hadir {r.totals.no_show} · di lokasi {r.totals.geo_valid}
      </Text>
      {Object.keys(r.totals.kpi).length > 0 && (
        <Muted>KPI: {Object.entries(r.totals.kpi).map(([k, v]) => `${campaignLabel(k)} ${v}`).join(' · ')}</Muted>
      )}
      {r.totals.open_exceptions > 0 && <Muted>Exception terbuka: {r.totals.open_exceptions}</Muted>}
      {isOps && !r.publishedAt && (
        <Btn title="Terbitkan ke Grab" small onPress={() => publish(r.date)} loading={busy === `pub-${r.date}`} />
      )}
    </Card>
  );

  const hasYesterday = s.dailyReports.some((r) => r.date === yesterday);

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <SectionHeader title="Laporan harian" subtitle="Dibuat otomatis 06:00 WIB, diterbitkan PIC paling lambat 10:00" />
      {isOps && !hasYesterday && (
        <Card style={{ marginBottom: SP.sm }}>
          <Muted>Laporan {yesterday} belum ada.</Muted>
          <Btn title={`Buat & terbitkan ${yesterday}`} small onPress={() => publish(yesterday)} loading={busy === `pub-${yesterday}`} />
        </Card>
      )}
      {s.dailyReports.length === 0 && !isOps && <Empty text="Belum ada laporan yang terbit." icon="document-outline" />}
      {s.dailyReports.slice(0, 14).map(reportCard)}

      <SectionHeader title="Ekspor CSV" subtitle="Bisa dibuka di Excel / Google Sheets" level="card" />
      <Card style={{ gap: SP.sm }}>
        <View style={{ flexDirection: 'row', gap: SP.sm }}>
          <View style={{ flex: 1 }}><DateField label="Dari" value={from} onChange={setFrom} /></View>
          <View style={{ flex: 1 }}><DateField label="Sampai" value={to} onChange={setTo} /></View>
        </View>
        <Btn title="Kehadiran & KPI per shift" variant="outline" onPress={() => doExport('attendance')} loading={busy === 'attendance'} />
        {isStaff && <Btn title="Payroll (jam normal & lembur)" variant="outline" onPress={() => doExport('payroll')} loading={busy === 'payroll'} />}
        <Btn title="Rekap tagihan (SPG-hari tervalidasi)" variant="outline" onPress={() => doExport('billing')} loading={busy === 'billing'} />
        <Muted>Tagihan hanya menghitung shift selesai, divalidasi PIC, dan tanpa exception terbuka.</Muted>
      </Card>
      <View style={{ height: SP.xl }} />
    </ScrollView>
  );
}
