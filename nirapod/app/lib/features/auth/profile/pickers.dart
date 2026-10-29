import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/i18n/languages.dart';
import '../../../core/i18n/numerals.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/icons/app_icon.dart';
import '../../../core/icons/app_icons.g.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../core/tz/tz_utils.dart';
import 'countries.dart';

/// Countries matching [query] (localized, English, native name or ISO code), sorted by localized name.
List<String> filterCountries(CountryNames names, String query, String lang, {Iterable<String>? codes}) {
  final q = foldForSearch(query.trim());
  final list = (codes ?? names.codes).where((cc) {
    if (q.isEmpty) return true;
    return foldForSearch(names.name(cc, lang)).contains(q) ||
        foldForSearch(names.name(cc, 'en')).contains(q) ||
        foldForSearch(names.nativeName(cc)).contains(q) ||
        cc.toLowerCase() == q;
  }).toList();
  list.sort((a, b) => names.name(a, lang).compareTo(names.name(b, lang)));
  return list;
}

String cityOf(String zone) => zone.split('/').last.replaceAll('_', ' ');

/// One group of the zone picker.
class ZoneGroup {
  const ZoneGroup(this.country, this.zones);
  final String country;
  final List<String> zones;
}

/// IANA zones grouped by country; [firstCountry] first, then by localized country name.
List<ZoneGroup> filterZones(TzData tz, CountryNames names, String query, String lang, {String? firstCountry}) {
  final q = foldForSearch(query.trim());
  final groups = <ZoneGroup>[];
  for (final cc in tz.zonesByCountry.keys) {
    final countryHit = q.isNotEmpty &&
        (foldForSearch(names.name(cc, lang)).contains(q) || foldForSearch(names.name(cc, 'en')).contains(q));
    final zones = tz.zonesForCountry(cc).where((z) {
      if (q.isEmpty || countryHit) return true;
      return foldForSearch(cityOf(z)).contains(q) || foldForSearch(z).contains(q);
    }).toList()
      ..sort((a, b) => cityOf(a).compareTo(cityOf(b)));
    if (zones.isNotEmpty) groups.add(ZoneGroup(cc, zones));
  }
  groups.sort((a, b) {
    if (a.country == firstCountry) return -1;
    if (b.country == firstCountry) return 1;
    return names.name(a.country, lang).compareTo(names.name(b.country, lang));
  });
  return groups;
}

class Flag4x3 extends StatelessWidget {
  const Flag4x3(this.cc, {super.key, this.width = 28});
  final String cc;
  final double width;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(3),
        child: SvgPicture.asset(
          flagAsset4x3(cc),
          width: width,
          height: width * 0.75,
          fit: BoxFit.cover,
          excludeFromSemantics: true,
          placeholderBuilder: (_) => SizedBox(width: width, height: width * 0.75),
        ),
      );
}

/// Frame shared by both pickers: title, search field, list.
class _PickerFrame extends StatelessWidget {
  const _PickerFrame({required this.title, required this.searchLabel, required this.onQuery, required this.child});
  final String title;
  final String searchLabel;
  final ValueChanged<String> onQuery;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.88,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, 0, Space.screenHorizontal, Space.xs),
            child: Row(children: [
              Expanded(child: Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleMedium))),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal),
            child: TextField(
              autofocus: false,
              onChanged: onQuery,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                labelText: searchLabel,
                prefixIcon: Padding(padding: const EdgeInsets.all(12), child: AppIcon(AppIcons.search, size: 20, color: c.muted)),
              ),
            ),
          ),
          const SizedBox(height: Space.xs),
          Expanded(child: child),
          SizedBox(height: MediaQuery.viewInsetsOf(context).bottom),
        ]),
      ),
    );
  }
}

class _NoResults extends StatelessWidget {
  const _NoResults(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(Space.xl),
          child: Text(text, style: Theme.of(context).textTheme.bodyMedium!.copyWith(color: context.colors.muted), textAlign: TextAlign.center),
        ),
      );
}

/// Searchable country list (overlay country_picker). Returns the ISO2 code.
Future<String?> showCountryPicker(BuildContext context, {required Strings strings, required CountryNames names, String? selected}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => CountryPickerSheet(strings: strings, names: names, selected: selected),
    );

class CountryPickerSheet extends StatefulWidget {
  const CountryPickerSheet({super.key, required this.strings, required this.names, this.selected});
  final Strings strings;
  final CountryNames names;
  final String? selected;

  @override
  State<CountryPickerSheet> createState() => _CountryPickerSheetState();
}

class _CountryPickerSheetState extends State<CountryPickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final lang = s.language;
    final list = filterCountries(widget.names, _q, lang);
    final c = context.colors;
    return _PickerFrame(
      title: s.t('profile.country'),
      searchLabel: s.t('profile.country_search'),
      onQuery: (v) => setState(() => _q = v),
      child: list.isEmpty
          ? _NoResults(s.t('profile.no_results'))
          : ListView.builder(
              itemCount: list.length,
              itemBuilder: (context, i) {
                final cc = list[i];
                final local = widget.names.name(cc, lang);
                final native = widget.names.nativeName(cc);
                final sel = cc == widget.selected;
                return Semantics(
                  button: true,
                  selected: sel,
                  label: local,
                  excludeSemantics: true,
                  child: InkWell(
                    onTap: () => Navigator.of(context).pop(cc),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: Sizes.bottomSheetRow),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal, vertical: Space.xs),
                        child: Row(children: [
                          Flag4x3(cc),
                          const SizedBox(width: Space.sm),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(local, style: Theme.of(context).textTheme.bodyLarge),
                              if (native != local)
                                Text(native, style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.muted)),
                            ]),
                          ),
                          if (sel) AppIcon(AppIcons.check, size: 20, color: c.primaryText),
                        ]),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

/// Searchable IANA zone list grouped by country with city, UTC offset and live local time
/// (overlay timezone_picker). Returns the zone id.
Future<String?> showZonePicker(
  BuildContext context, {
  required Strings strings,
  required CountryNames names,
  required TzData tz,
  String? selected,
  String? country,
}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => ZonePickerSheet(strings: strings, names: names, tz: tz, selected: selected, country: country),
    );

class ZonePickerSheet extends StatefulWidget {
  const ZonePickerSheet({super.key, required this.strings, required this.names, required this.tz, this.selected, this.country});
  final Strings strings;
  final CountryNames names;
  final TzData tz;
  final String? selected;
  final String? country;

  @override
  State<ZonePickerSheet> createState() => _ZonePickerSheetState();
}

class _ZonePickerSheetState extends State<ZonePickerSheet> {
  String _q = '';
  DateTime _now = DateTime.now();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  void _schedule() {
    _tick = Timer(untilNextMinute(DateTime.now()), () {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
      _schedule();
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.strings;
    final lang = s.language;
    final language = languageFor(lang);
    final use24h = MediaQuery.alwaysUse24HourFormatOf(context);
    final groups = filterZones(widget.tz, widget.names, _q, lang, firstCountry: widget.country);
    final rows = <(String?, String?)>[]; // (country header, zone)
    for (final g in groups) {
      rows.add((g.country, null));
      for (final z in g.zones) {
        rows.add((null, z));
      }
    }
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    return _PickerFrame(
      title: s.t('profile.timezone'),
      searchLabel: s.t('profile.tz_search'),
      onQuery: (v) => setState(() => _q = v),
      child: rows.isEmpty
          ? _NoResults(s.t('profile.no_results'))
          : ListView.builder(
              itemCount: rows.length,
              itemBuilder: (context, i) {
                final (cc, zone) = rows[i];
                if (cc != null) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(Space.screenHorizontal, Space.md, Space.screenHorizontal, Space.xxs),
                    child: Semantics(
                      header: true,
                      child: Row(children: [
                        Flag4x3(cc, width: 20),
                        const SizedBox(width: Space.xs),
                        Expanded(child: Text(widget.names.name(cc, lang), style: t.labelMedium!.copyWith(color: c.muted, fontWeight: FontWeight.w600))),
                      ]),
                    ),
                  );
                }
                final z = zone!;
                final offset = formatUtcOffset(inZone(_now, z).timeZoneOffset);
                final time = formatLocalTime(_now, z, language: language, use24h: use24h);
                final utc = s.t('profile.utc_offset', {'offset': localizeOffset(offset, language)});
                final sel = z == widget.selected;
                return Semantics(
                  button: true,
                  selected: sel,
                  label: '${cityOf(z)}, $utc, $time',
                  excludeSemantics: true,
                  child: InkWell(
                    onTap: () => Navigator.of(context).pop(z),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: Sizes.bottomSheetRow),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: Space.screenHorizontal, vertical: Space.xs),
                        child: Row(children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(cityOf(z), style: t.bodyLarge),
                              Text(utc, style: t.bodySmall!.copyWith(color: c.muted)),
                            ]),
                          ),
                          Text(time, style: t.bodyMedium!.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
                          if (sel) ...[const SizedBox(width: Space.xs), AppIcon(AppIcons.check, size: 20, color: c.primaryText)],
                        ]),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

/// "+5:30" with the language's digits (sign stays ASCII, LTR isolate so it never flips in RTL).
String localizeOffset(String offset, Language language) => '\u2066${localizeDigits(offset, language.numerals)}\u2069';
