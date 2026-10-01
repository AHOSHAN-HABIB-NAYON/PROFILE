<?php
View::$meta['title'] = $notFound ? 'পাওয়া যায়নি' : 'অনুমতি নেই';
?>
<div class="card"><?= empty_state($notFound ? 'search' : 'lock', $notFound ? 'পেজটি পাওয়া যায়নি' : 'এই অংশে আপনার অনুমতি নেই', $notFound ? '' : 'Super Admin-এর সাথে যোগাযোগ করুন।') ?></div>
