<?php

namespace PHPageBuilder\WebsiteManager;

use PHPageBuilder\Contracts\WebsiteManagerContract;
use PHPageBuilder\PageRepository;

class WebsiteManager implements WebsiteManagerContract
{
    /**
     * Render the website manager overview page.
     */
    public function renderOverview()
    {
        $pageRepository = new PageRepository;
        $pages = $pageRepository->getAll();

        $page = 'overview';
        require_once 'resources/views/layout.php';
    }

    /**
     * Render the website manager page settings (add/edit page form).
     */
    public function renderPageSettings()
    {
        $page = 'page-settings';
        require_once 'resources/views/layout.php';
    }

    /**
     * Render the website manager menu settings (add/edit menu form).
     */
    public function renderMenuSettings()
    {
        $page = 'menu-settings';
        require_once 'resources/views/layout.php';
    }
}