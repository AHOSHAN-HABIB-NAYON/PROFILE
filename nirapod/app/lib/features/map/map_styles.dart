// Google Maps JSON styles. Dark style follows the app's dark tokens (#0B1512 background, emerald accents).
const darkMapStyle = '''[
{"elementType":"geometry","stylers":[{"color":"#121F1B"}]},
{"elementType":"labels.text.fill","stylers":[{"color":"#8FA39D"}]},
{"elementType":"labels.text.stroke","stylers":[{"color":"#0B1512"}]},
{"featureType":"road","elementType":"geometry","stylers":[{"color":"#20322D"}]},
{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#2A433C"}]},
{"featureType":"water","elementType":"geometry","stylers":[{"color":"#0B2A2A"}]},
{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#143026"}]},
{"featureType":"poi","elementType":"labels.icon","stylers":[{"saturation":-60},{"lightness":-20}]}
]''';

const darkMapStyleNoLabels = '''[
{"elementType":"geometry","stylers":[{"color":"#121F1B"}]},
{"elementType":"labels","stylers":[{"visibility":"off"}]},
{"featureType":"road","elementType":"geometry","stylers":[{"color":"#20322D"}]},
{"featureType":"water","elementType":"geometry","stylers":[{"color":"#0B2A2A"}]}
]''';

const lightMapStyleNoLabels = '''[{"elementType":"labels","stylers":[{"visibility":"off"}]}]''';
