import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/i18n/locale_controller.dart';
import '../../core/i18n/strings.dart';
import '../../core/icons/app_icon.dart';
import '../../core/icons/app_icons.g.dart';
import '../../core/net/api_client.dart';
import '../../core/net/api_error.dart';
import '../../core/net/providers.dart';
import '../../core/session/session.dart';
import '../../core/state/buttons.dart';
import '../../core/state/state_views.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import '../../core/tz/tz_utils.dart';
import '../family/data/realtime.dart';

class ChatAgent {
  const ChatAgent(this.name, this.photoUrl);
  final String name;
  final String? photoUrl;
  static ChatAgent? fromJson(Object? j) =>
      j is Map ? ChatAgent('${j['name'] ?? ''}', j['photo_url'] as String?) : null;
}

class ChatMessage {
  const ChatMessage({required this.id, required this.sender, this.body, this.agent, this.imageUrl, this.imageGone = false, required this.at, this.readAt, this.failed = false});
  final String id;
  final String sender; // user | ai | agent | system
  final String? body;
  final ChatAgent? agent;
  final String? imageUrl;
  final bool imageGone;
  final DateTime at;
  final DateTime? readAt;
  final bool failed;

  bool get mine => sender == 'user';
  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: '${j['id']}',
        sender: j['sender'] as String? ?? 'system',
        body: j['body'] as String?,
        agent: ChatAgent.fromJson(j['agent']),
        imageUrl: (j['image'] is Map) ? (j['image'] as Map)['url'] as String? : null,
        imageGone: j['image_expired'] == true,
        at: DateTime.tryParse(j['created_at'] as String? ?? '')?.toUtc() ?? DateTime.now().toUtc(),
        readAt: DateTime.tryParse(j['read_at'] as String? ?? '')?.toUtc(),
      );
}

class ChatConversation {
  const ChatConversation({required this.id, required this.status, this.urgent = false, this.agent, this.messages = const []});
  final String id;
  final String status; // ai | needs_human | human | closed
  final bool urgent;
  final ChatAgent? agent;
  final List<ChatMessage> messages;

  ChatConversation copyWith({String? status, List<ChatMessage>? messages, ChatAgent? agent}) =>
      ChatConversation(id: id, status: status ?? this.status, urgent: urgent, agent: agent ?? this.agent, messages: messages ?? this.messages);

  factory ChatConversation.fromJson(Map<String, dynamic> j) => ChatConversation(
        id: j['id'] as String,
        status: j['status'] as String? ?? 'ai',
        urgent: j['urgent'] == true,
        agent: ChatAgent.fromJson(j['agent']),
        messages: ((j['messages'] as List?) ?? const []).map((e) => ChatMessage.fromJson((e as Map).cast<String, dynamic>())).toList(),
      );
}

/// Live chat API (routes/chat.js). Children get FORBIDDEN (reason: child).
abstract class ChatRepo {
  Future<ChatConversation?> current();
  Future<ChatConversation> send(String body, {bool priority = false});
  Future<ChatConversation> sendImage(Uint8List jpeg);
  Future<ChatConversation> escalate();
  Future<String> close();
  Future<void> rate(String conversationId, String rating);
  Future<void> markRead();
}

class HttpChatRepo implements ChatRepo {
  HttpChatRepo(this._c);
  final ApiClient _c;
  ChatConversation _conv(dynamic j) => ChatConversation.fromJson(((j as Map)['conversation'] as Map).cast<String, dynamic>());

  @override
  Future<ChatConversation?> current() async {
    final j = await _c.get<Map<String, dynamic>>('/chat/current');
    return j['conversation'] == null ? null : _conv(j);
  }

  @override
  Future<ChatConversation> send(String body, {bool priority = false}) async =>
      _conv(await _c.post<dynamic>('/chat/messages', data: {'body': body, if (priority) 'priority': true}));

  @override
  Future<ChatConversation> sendImage(Uint8List jpeg) async {
    try {
      final form = FormData.fromMap({'image': MultipartFile.fromBytes(jpeg, filename: 'photo.jpg', contentType: DioMediaType('image', 'jpeg'))});
      return _conv((await _c.dio.post<dynamic>('/chat/images', data: form)).data);
    } catch (e) {
      throw ApiError.from(e);
    }
  }

  @override
  Future<ChatConversation> escalate() async => _conv(await _c.post<dynamic>('/chat/escalate'));

  @override
  Future<String> close() async => ((await _c.post<Map<String, dynamic>>('/chat/close'))['closed'] as String?) ?? '';

  @override
  Future<void> rate(String conversationId, String rating) => _c.post<dynamic>('/chat/rate', data: {'conversation_id': conversationId, 'rating': rating});

  @override
  Future<void> markRead() => _c.post<dynamic>('/chat/read');
}

final chatRepoProvider = Provider<ChatRepo>((ref) => HttpChatRepo(ref.watch(apiClientProvider)));

/// Bearer header for chat images (they are private to the user).
final chatImageHeadersProvider = FutureProvider<Map<String, String>>((ref) async {
  final t = await ref.read(tokenStoreProvider).read();
  return t == null ? const {} : {'authorization': 'Bearer ${t.access}'};
});

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, this.priority = false});
  final bool priority;
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  StreamSubscription<RealtimeEvent>? _sub;
  ChatConversation? _conv;
  bool _loading = true;
  bool _child = false;
  bool _sending = false;
  bool _typing = false;
  String? _endedId;
  String? _rated;
  Object? _error;
  final _pending = <ChatMessage>[];

  ChatRepo get _repo => ref.read(chatRepoProvider);

  @override
  void initState() {
    super.initState();
    _load();
    _sub = ref.read(realtimeProvider).events.where((e) => e.name.startsWith('chat.')).listen(_onEvent);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final c = await _repo.current();
      if (!mounted) return;
      setState(() {
        _conv = c;
        _loading = false;
        _error = null;
      });
      if (c != null) unawaited(_repo.markRead().catchError((_) {}));
      _toEnd();
    } catch (e) {
      final err = ApiError.from(e);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _child = err.code == 'FORBIDDEN';
        _error = _child ? null : err;
      });
    }
  }

  void _onEvent(RealtimeEvent e) {
    final c = _conv;
    if (e.name == 'chat.typing') {
      setState(() => _typing = e.data['typing'] == true);
      _toEnd();
      return;
    }
    if (c == null || e.data['conversation_id'] != c.id) {
      if (e.name == 'chat.message') _load();
      return;
    }
    if (e.name == 'chat.message' && e.data['message'] is Map) {
      final m = ChatMessage.fromJson((e.data['message'] as Map).cast<String, dynamic>());
      if (c.messages.any((x) => x.id == m.id)) return;
      setState(() => _conv = c.copyWith(messages: [...c.messages, m]));
      if (!m.mine) unawaited(_repo.markRead().catchError((_) {}));
      _toEnd();
    } else if (e.name == 'chat.updated') {
      if (e.data['status'] == 'closed') {
        setState(() {
          _endedId = c.id;
          _conv = null;
        });
      } else {
        _load();
      }
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      });

  Future<void> _send([String? preset]) async {
    final body = (preset ?? _text.text).trim();
    if (body.isEmpty || _sending) return;
    final temp = ChatMessage(id: 'local-${DateTime.now().microsecondsSinceEpoch}', sender: 'user', body: body, at: DateTime.now().toUtc());
    setState(() {
      _sending = true;
      _endedId = null;
      _pending.add(temp);
      if (preset == null) _text.clear();
    });
    _toEnd();
    try {
      final c = await _repo.send(body, priority: widget.priority);
      if (!mounted) return;
      setState(() {
        _pending.remove(temp);
        _conv = c;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        final i = _pending.indexOf(temp);
        if (i >= 0) _pending[i] = ChatMessage(id: temp.id, sender: 'user', body: body, at: temp.at, failed: true);
      });
    } finally {
      if (mounted) setState(() => _sending = false);
      _toEnd();
    }
  }

  Future<void> _pickImage(Strings s) async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, maxHeight: 1600, imageQuality: 82, requestFullMetadata: false);
    if (x == null) return;
    final bytes = await x.readAsBytes();
    if (bytes.length > 5 * 1024 * 1024) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t('chat.image_too_big'))));
      return;
    }
    setState(() => _sending = true);
    try {
      final c = await _repo.sendImage(bytes);
      if (mounted) setState(() => _conv = c);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.t(ApiError.from(e).messageKey))));
    } finally {
      if (mounted) setState(() => _sending = false);
      _toEnd();
    }
  }

  Future<void> _escalate() async {
    if (_conv == null) {
      await _send(ref.read(screenStringsProvider('chat')).t('chat.talk_person'));
      return;
    }
    try {
      final c = await _repo.escalate();
      if (mounted) setState(() => _conv = c);
      _toEnd();
    } catch (_) {}
  }

  Future<void> _end(Strings s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(s.t('chat.end_confirm')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('common.cancel'))),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s.t('chat.end'))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final id = await _repo.close();
      if (mounted) {
        setState(() {
          _endedId = id;
          _conv = null;
          _pending.clear();
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(screenStringsProvider('chat'));
    final c = context.colors;
    final conv = _conv;
    final agent = conv?.status == 'human' ? conv?.agent : null;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 0,
        title: _ChatTitle(strings: s, agent: agent, waiting: conv?.status == 'needs_human', typing: _typing),
        actions: [
          if (conv != null)
            IconButton(
              tooltip: s.t('chat.end'),
              onPressed: () => _end(s),
              icon: AppIcon(AppIcons.close, color: c.text),
            ),
        ],
        bottom: PreferredSize(preferredSize: const Size.fromHeight(1), child: Container(height: 1, color: c.border)),
      ),
      body: SafeArea(
        top: false,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _child
                ? MessageView(icon: AppIcons.users, title: s.t('chat.child'), body: s.t('chat.child_body'))
                : _error != null
                    ? MessageView(
                        icon: AppIcons.wifiOff,
                        title: s.t(ApiError.from(_error!).messageKey),
                        action: AppButton(label: s.t('common.retry'), onPressed: () {
                          setState(() => _loading = true);
                          _load();
                        }),
                      )
                    : Column(children: [
                        if (conv?.status != 'human' && conv?.status != 'needs_human' && _endedId == null)
                          _TalkToPersonBar(strings: s, onTap: _escalate),
                        Expanded(child: _messages(s)),
                        if (_endedId == null) _composer(s),
                      ]),
      ),
    );
  }

  Widget _messages(Strings s) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final list = [...?_conv?.messages, ..._pending];
    if (_endedId != null) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Space.xl),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
              alignment: Alignment.center,
              child: AppIcon(AppIcons.checkCircle, size: 32, color: c.primaryText),
            ),
            const SizedBox(height: Space.md),
            Text(s.t('chat.ended'), style: t.titleMedium),
            const SizedBox(height: Space.md),
            if (_rated == null) ...[
              Text(s.t('chat.rate'), style: t.bodyMedium!.copyWith(color: c.muted)),
              const SizedBox(height: Space.sm),
              Row(mainAxisSize: MainAxisSize.min, children: [
                for (final (r, icon) in const [('up', AppIcons.thumbsUp), ('down', AppIcons.thumbsDown)])
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Space.xs),
                    child: OutlinedButton(
                      key: Key('rate_$r'),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(64, 48), shape: const StadiumBorder()),
                      onPressed: () {
                        setState(() => _rated = r);
                        _repo.rate(_endedId!, r).catchError((_) {});
                      },
                      child: AppIcon(icon, color: c.primaryText),
                    ),
                  ),
              ]),
            ] else
              Text(s.t('chat.thanks'), style: t.bodyMedium!.copyWith(color: c.successText)),
            const SizedBox(height: Space.lg),
            AppButton(label: s.t('chat.new'), onPressed: () => setState(() => _endedId = null)),
          ]),
        ),
      );
    }
    if (list.isEmpty) {
      return ListView(padding: const EdgeInsets.all(Space.md), children: [
        const SizedBox(height: Space.lg),
        Center(
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
            alignment: Alignment.center,
            child: AppIcon(AppIcons.message, size: 28, color: c.primaryText),
          ),
        ),
        const SizedBox(height: Space.sm),
        Text(s.t('chat.welcome_title'), style: t.titleMedium, textAlign: TextAlign.center),
        const SizedBox(height: Space.xxs),
        Text(s.t('chat.welcome_body'), style: t.bodyMedium!.copyWith(color: c.muted), textAlign: TextAlign.center),
        const SizedBox(height: Space.md),
        _Notice(text: s.t('chat.notice')),
        const SizedBox(height: Space.md),
        Wrap(alignment: WrapAlignment.center, spacing: Space.xs, runSpacing: Space.xs, children: [
          for (final k in const ['chat.chip_location', 'chat.chip_child', 'chat.chip_premium', 'chat.chip_delete'])
            ActionChip(
              label: Text(s.t(k)),
              onPressed: () => _send(s.t(k)),
              shape: const StadiumBorder(),
              side: BorderSide(color: c.primary.withValues(alpha: 0.4)),
              backgroundColor: c.surface,
            ),
        ]),
      ]);
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(Space.sm, Space.sm, Space.sm, Space.sm),
      itemCount: list.length + (_typing ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == list.length) return const _TypingBubble();
        final m = list[i];
        final prev = i > 0 ? list[i - 1] : null;
        final grouped = prev != null && prev.sender == m.sender;
        if (m.sender == 'system') return _SystemLine(message: m);
        return _Bubble(message: m, grouped: grouped, strings: s, onRetry: m.failed ? () {
          setState(() => _pending.remove(m));
          _send(m.body);
        } : null);
      },
    );
  }

  Widget _composer(Strings s) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.fromLTRB(Space.xs, Space.xs, Space.xs, Space.xs),
      decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        IconButton(
          tooltip: s.t('chat.attach'),
          onPressed: _sending ? null : () => _pickImage(s),
          icon: AppIcon(AppIcons.image, color: c.muted),
        ),
        Expanded(
          child: TextField(
            controller: _text,
            minLines: 1,
            maxLines: 4,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: s.t('chat.hint'),
              counterText: '',
              isDense: true,
              filled: true,
              fillColor: c.background,
              contentPadding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: 12),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
            ),
          ),
        ),
        const SizedBox(width: Space.xxs),
        Semantics(
          button: true,
          label: s.t('chat.send'),
          child: Material(
            color: _text.text.trim().isEmpty ? c.border : c.primaryFill,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _text.text.trim().isEmpty ? null : () => _send(),
              child: SizedBox.square(
                dimension: 44,
                child: Center(child: AppIcon(AppIcons.send, size: 20, color: _text.text.trim().isEmpty ? c.muted : c.onPrimaryFill)),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _ChatTitle extends StatelessWidget {
  const _ChatTitle({required this.strings, this.agent, required this.waiting, required this.typing});
  final Strings strings;
  final ChatAgent? agent;
  final bool waiting;
  final bool typing;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final s = strings;
    final sub = typing ? s.t('chat.typing') : waiting ? s.t('chat.waiting') : s.t('chat.online');
    return Row(children: [
      _AgentAvatar(agent: agent, size: 36),
      const SizedBox(width: Space.sm),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(agent != null ? s.t('chat.agent', {'name': agent!.name}) : s.t('chat.assistant'),
              style: t.titleMedium, maxLines: 1, overflow: TextOverflow.ellipsis),
          Text(sub, style: t.bodySmall!.copyWith(color: typing ? c.primaryText : c.muted), maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      ),
    ]);
  }
}

class _AgentAvatar extends ConsumerWidget {
  const _AgentAvatar({this.agent, required this.size});
  final ChatAgent? agent;
  final double size;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final url = agent?.photoUrl;
    Widget fallback() => agent == null
        ? SvgPicture.asset(BrandAssets.logoApp, width: size, height: size, excludeFromSemantics: true)
        : Container(
            color: c.accent.withValues(alpha: 0.2),
            alignment: Alignment.center,
            child: Text(agent!.name.isEmpty ? '?' : agent!.name.characters.first.toUpperCase(), style: TextStyle(fontWeight: FontWeight.w700, color: c.primaryText)),
          );
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: url == null || url.isEmpty
            ? fallback()
            : Image.network(url.startsWith('http') ? url : '${RealtimeClient.serverOrigin}$url', fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback()),
      ),
    );
  }
}

class _TalkToPersonBar extends StatelessWidget {
  const _TalkToPersonBar({required this.strings, required this.onTap});
  final Strings strings;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.primary.withValues(alpha: 0.08),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.md, vertical: Space.xs),
          child: Row(children: [
            AppIcon(AppIcons.user, size: 18, color: c.primaryText),
            const SizedBox(width: Space.xs),
            Expanded(child: Text(strings.t('chat.talk_person'), style: TextStyle(color: c.primaryText, fontWeight: FontWeight.w600))),
            AppIcon(AppIcons.chevronRight, size: 18, color: c.primaryText),
          ]),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(Space.sm),
      decoration: BoxDecoration(color: c.warning.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(Radii.input)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AppIcon(AppIcons.lock, size: 18, color: c.warningText),
        const SizedBox(width: Space.xs),
        Expanded(child: Text(text, style: Theme.of(context).textTheme.bodySmall)),
      ]),
    );
  }
}

class _SystemLine extends StatelessWidget {
  const _SystemLine({required this.message});
  final ChatMessage message;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final agent = message.agent;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.xs, horizontal: Space.lg),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: Space.sm, vertical: 6),
          decoration: BoxDecoration(color: c.border.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(Radii.card)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (agent != null) ...[_AgentAvatar(agent: agent, size: 22), const SizedBox(width: 6)],
            Flexible(child: Text(message.body ?? '', style: t.bodySmall!.copyWith(color: c.text), textAlign: TextAlign.center)),
          ]),
        ),
      ),
    );
  }
}

class _Bubble extends ConsumerWidget {
  const _Bubble({required this.message, required this.grouped, required this.strings, this.onRetry});
  final ChatMessage message;
  final bool grouped;
  final Strings strings;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.colors;
    final t = Theme.of(context).textTheme;
    final mine = message.mine;
    final bg = mine ? c.primaryFill : c.surface;
    final fg = mine ? c.onPrimaryFill : c.text;
    final zone = ref.watch(sessionControllerProvider) is SignedIn ? (ref.watch(sessionControllerProvider) as SignedIn).user.timezone : null;
    final time = formatLocalTime(message.at, zone ?? 'UTC', language: ref.watch(languageProvider), use24h: MediaQuery.alwaysUse24HourFormatOf(context));
    const r = Radius.circular(18);
    const small = Radius.circular(6);
    final radius = BorderRadiusDirectional.only(
      topStart: r,
      topEnd: r,
      bottomStart: mine ? r : small,
      bottomEnd: mine ? small : r,
    );
    final headers = ref.watch(chatImageHeadersProvider).value;
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.76),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      decoration: BoxDecoration(color: bg, borderRadius: radius, border: mine ? null : Border.all(color: c.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        if (message.imageUrl != null && headers != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network('${RealtimeClient.serverOrigin}${message.imageUrl}', headers: headers, width: 220, fit: BoxFit.cover),
            ),
          ),
        if (message.imageGone)
          Text(strings.t('chat.image_gone'), style: t.bodySmall!.copyWith(color: fg.withValues(alpha: 0.7), fontStyle: FontStyle.italic)),
        if ((message.body ?? '').isNotEmpty) Text(message.body!, style: t.bodyMedium!.copyWith(color: fg, height: 1.35)),
        const SizedBox(height: 2),
        Row(mainAxisSize: MainAxisSize.min, children: [
          Text(time, style: t.labelSmall!.copyWith(color: fg.withValues(alpha: 0.7))),
          if (mine && !message.failed) ...[
            const SizedBox(width: 4),
            AppIcon(message.readAt != null ? AppIcons.checkDouble : AppIcons.check, size: 14, color: message.readAt != null ? c.accent : fg.withValues(alpha: 0.7)),
          ],
        ]),
      ]),
    );
    return Padding(
      padding: EdgeInsets.only(top: grouped ? 2 : Space.xs),
      child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
        if (!mine && !grouped)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 4, bottom: 2),
            child: Text(message.sender == 'agent' && message.agent != null ? message.agent!.name : strings.t('chat.assistant'),
                style: t.labelSmall!.copyWith(color: c.muted)),
          ),
        Row(mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start, crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (!mine) ...[
            Opacity(opacity: grouped ? 0 : 1, child: _AgentAvatar(agent: message.sender == 'agent' ? message.agent : null, size: 28)),
            const SizedBox(width: 6),
          ],
          Flexible(child: bubble),
        ]),
        if (message.failed)
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(minimumSize: const Size(0, 32), padding: const EdgeInsets.symmetric(horizontal: 8)),
            child: Text(strings.t('chat.failed'), style: TextStyle(color: c.dangerText)),
          ),
      ]),
    );
  }
}

class _TypingBubble extends StatefulWidget {
  const _TypingBubble();
  @override
  State<_TypingBubble> createState() => _TypingBubbleState();
}

class _TypingBubbleState extends State<_TypingBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(top: Space.xs, left: 34),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(18), border: Border.all(color: c.border)),
          child: AnimatedBuilder(
            animation: _c,
            builder: (_, _) => Row(mainAxisSize: MainAxisSize.min, children: [
              for (var i = 0; i < 3; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: c.muted.withValues(alpha: 0.35 + 0.65 * (((_c.value * 3 - i) % 3) < 1 ? 1 : 0)),
                  ),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Route helper: /chat?priority=1 from the Premium tab "Priority Support".
Widget chatRoute(GoRouterState st) => ChatScreen(priority: st.uri.queryParameters['priority'] == '1');
