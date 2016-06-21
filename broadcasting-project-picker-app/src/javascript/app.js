Ext.define("TSBroadcastingProjectPicker", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            showScopeSelector: true
        }
    },

    integrationHeaders : {
        name : "TSBroadcastingProjectPicker"
    },
                        
    launch: function() {
        
       this._addComponents();
       
    },
    
    _addComponents: function() {
        this.removeAll();
        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {
            this.add({
                xtype: 'tsmultiprojectpicker',
                listeners: {
                    change: function(picker, projects) {
                        this._changeProjects(picker,projects);
                        this._publishProjects();
                    },
                    scope: this
                }
            });
            this.subscribe(this, 'requestProjects', this._publishProjects, this);
        } else {
            this.subscribe(this, 'projectsChanged', this._changeProjects, this);
            this.publish('requestProjects', this);
        }
    },
    
    _changeProjects: function(picker,projects) {
        this.projects = projects;
        this.logger.log('Projects Changed', projects);
    },
    
    _publishProjects: function() {
        this.publish('projectsChanged', this.down('tsmultiprojectpicker'), this.projects || []);  
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    getSettingsFields: function() {
        return [{
            name: 'showScopeSelector',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Scope Selector'
        }];
    },
    
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
});
